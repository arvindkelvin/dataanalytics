import * as _ from 'lodash';
import { filter } from 'lodash';

class TreeNode {
    public value: string;
    public child: Array<TreeNode>
    constructor(value) {
        this.value = value;
        this.child = [];
    }
}


export abstract class QueryBuilderService {
    public query: any;
    public dataModel: any;
    public tables: any[];
    public queryTODO: any;
    public user: string;
    public groups: Array<string> = [];
    public permissions: any[];

    constructor(queryTODO: any, dataModel: any, user: any) {

        this.queryTODO = queryTODO;
        this.dataModel = dataModel;
        this.user = user._id;
        this.groups = user.role;
        this.tables = dataModel.ds.model.tables;

    }

    abstract getFilters(filters, type: string);
    abstract getJoins(joinTree: any[], dest: any[], tables: Array<any>, schema?: string, database?: string);
    abstract getSeparedColumns(origin: string, dest: string[]);
    abstract filterToString(filterObject: any, type: string);
    abstract processFilter(filter: any, columnType: string);
    abstract normalQuery(columns: string[], origin: string, dest: any[], joinTree: any[],
        grouping: any[], tables: Array<any>, limit: number, Schema?: string, database?: string);
    abstract sqlQuery(query: string, filters: any[], filterMarks: string[]): string;
    abstract buildPermissionJoin(origin: string, join: string[], permissions: any[], schema?: string);
    abstract parseSchema(tables: string[], schema?: string, database?: string);

    public builder() {
        const graph = this.buildGraph();

        /* We take the names of the tables, source and destination (it's arbitrary), the columns and the type of aggregation to build the query */
        const origin = this.queryTODO.fields.find(x => x.order === 0).table_id;
        const dest = [];
        const filterTables = this.queryTODO.filters.map(filter => filter.filter_table);
        const modelPermissions = this.dataModel.ds.metadata.model_granted_roles;

        // Let's add the filter tables
        filterTables.forEach(table => {
            if (!dest.includes(table) && table !== origin) {
                dest.push(table);
            }
        });

        /** Check column permissions, if there are permissions they are put in the filters */
        this.permissions = this.getPermissions(modelPermissions, this.tables, origin);

        if (this.permissions.length > 0) {
            this.permissions.forEach(permission => {
                if (!dest.includes(permission.filter_table) && permission.filter_table !== origin) {
                    dest.push(permission.filter_table);
                }
            });
        }

        /** SEPARATE BETWEEN AGGREGATION COLUMNS/GROUPING COLUMNS */
        const separedCols = this.getSeparedColumns(origin, dest);
        const columns = separedCols[0];
        const grouping = separedCols[1];

        /** TREE OF JOINS TO BE DONE */
        const joinTree = this.dijkstraAlgorithm(graph, origin, dest.slice(0));

        if (this.queryTODO.simple) {
            this.query = this.simpleQuery(columns, origin);
            return this.query;
        } else {
            let tables = this.dataModel.ds.model.tables
                .map(table => { return { name: table.table_name, query: table.query } });
            this.query = this.normalQuery(columns, origin, dest, joinTree, grouping, tables,
                this.queryTODO.queryLimit, this.dataModel.ds.connection.schema, this.dataModel.ds.connection.database);

            // if(this.queryTODO.queryLimit) this.query += `\nlimit ${this.queryTODO.queryLimit}`;
            return this.query;
        }
    }

    public buildGraph() {
        const graph = [];
        //There is no need to remove the hidden relations because I put them in the no_relations array when saving
        //All relationships are already good. I leave it because the loop is already done...
        this.tables.forEach(t => {
            const relations = [];
            t.relations
                .forEach(r => { relations.push(r.target_table) });
            graph.push({ name: t.table_name, rel: relations });
        });
        return graph;
    }

    public dijkstraAlgorithm(graph, origin, dest) {
        const not_visited = [];
        const v = [];

        graph.forEach(n => {
            if (n.name !== origin) {
                not_visited.push({ name: n.name, dist: Infinity, path: [] });
            } else {
                not_visited.push({ name: n.name, dist: 0, path: [] });
            }
        });

        while (not_visited.length > 0 && dest.length > 0) {
            //let min = { name: 'foo', dist: Infinity, path: [] };
            let min = not_visited[0];
            for (let i = 1; i < not_visited.length; i++) {
                if (min.dist > not_visited[i].dist) {
                    min = not_visited[i];
                }
            }

            let e = graph.filter(g => g.name === min.name)[0];
            for (let i = 0; i < e.rel.length; i++) {
                let elem = not_visited.filter(n => n.name === e.rel[i])[0];
                if (elem) {
                    if (elem.dist > min.dist + 1) {
                        elem.dist = min.dist + 1;
                        min.path.forEach(p => {
                            elem.path.push(p);
                        });
                        elem.path.push(min.name);

                    }
                }
            }
            v.push(min);

            let index = not_visited.indexOf(not_visited.find(x => x.name === min.name));
            if (index > -1) {
                not_visited.splice(index, 1);
            }

            dest.forEach(n => {
                if (v.indexOf(v.find(x => x.name === n)) > -1) {
                    dest.splice(dest.indexOf(n), 1);
                }
            })

        }
        return (v);
    }

    public simpleQuery(columns: string[], origin: string) {

        const schema = this.dataModel.ds.connection.schema;
        if (schema) {
            origin = `${schema}.${origin}`;
        }
        return `SELECT DISTINCT ${columns.join(', ')} \nFROM ${origin}`;
    }

    public cleanOriginTable(originTable:string):string {
        let res = "";
        if(originTable.slice(0,1)=='`' && originTable.charAt(originTable.length - 1)=='`'){
            res = originTable.substring(1, originTable.length-1);
        }else if(originTable.slice(0,1)=='\'' && originTable.charAt(originTable.length - 1)=='\''){
            res = originTable.substring(1, originTable.length-1);
        }else if(originTable.slice(0,1)=='"' && originTable.charAt(originTable.length - 1)=='"'){
            res = originTable.substring(1, originTable.length-1);
        }else{
            res = originTable;
        }
        return  res;
    }
    public getPermissions(modelPermissions, modelTables, originTable) {

        originTable = this.cleanOriginTable(originTable);
        const filters = [];
        const permissions = this.getUserPermissions(modelPermissions);

        const relatedTables = this.checkRelatedTables(modelTables, originTable);

        let found = -1;
        if (relatedTables !== null && permissions !== null) {
            permissions.forEach(permission => {
                found = relatedTables.findIndex((t: any) => t.table_name === permission.table);
                if (found >= 0) {
                    let filter = {
                        filter_table: permission.table,
                        filter_column: permission.column,
                        filter_type: 'in',
                        filter_elements: [{ value1: permission.value }]
                    };

                    filters.push(filter);
                    found = -1;
                }
            });
        }

        return filters;
    }

    public getUserPermissions(modelPermissions: any[]) {

        const permissions = [];
        modelPermissions.forEach(permission => {
            switch (permission.type) {
                case 'users':
                    if (permission.users.includes(this.user) && !permission.global) {
                        permissions.push(permission);
                    }
                    break;
                case 'groups':
                    this.groups.forEach(group => {
                        if (permission.groups.includes(group) && !permission.global) {
                            permissions.push(permission)
                        }
                    })
            }

        });
        return permissions;
    }

    /**
     * Main function to check relations
     * @param dMbModel all tables from model
     * @param tablename  (string)
     * @return array with all related tables
     */
    public checkRelatedTables(dbModel, tableName) {

        const originTable = dbModel.filter(t => t.table_name === tableName)[0];
        const tablesMap = this.findRelationsRecursive(dbModel, originTable, new Map());
        return Array.from(tablesMap.values());
    }


    /**
     * recursive function to find all related tables to given table
     * @param tables all model's tables (with relations)
     * @param table  origin table
     * @param vMap   Map() to keep tracking visited nodes -> first call is just a new Map()
     */

    // not needed to filter relations. They are stored in a different array
    public findRelationsRecursive(tables, table, vMap) {
        vMap.set(table.table_name, table);
        table.relations
            .forEach(rel => {
                const newTable = tables.find(t => t.table_name === rel.target_table);
                if (!vMap.has(newTable.table_name)) {
                    this.findRelationsRecursive(tables, newTable, vMap);
                }
            });
        return vMap;
    }

    public findJoinColumns(tableA: string, tableB: string) {

        const table = this.tables.find(x => x.table_name === tableA);
        // No needed to filter visible relations because they are stored in a different array: no_relations
        const source_columns = table.relations.find(x => x.target_table === tableB).source_column;
        const target_columns = table.relations.find(x => x.target_table === tableB).target_column;
        return [target_columns, source_columns];

    }


    public findColumn(table: string, column: string) {
        const tmpTable = this.tables.find(t => t.table_name === table);
        return tmpTable.columns.find(c => c.column_name === column);
    }

    public setFilterType(filter: string) {
        if (['=', '!=', '>', '<', '<=', '>=', 'like', 'not_like'].includes(filter)) return 0;
        else if (['not_in', 'in'].includes(filter)) return 1;
        else if (filter === 'between') return 2;
        else if (filter === 'not_null') return 3;
    }

    public sqlBuilder(userQuery: any, filters: any[]): string {

        const graph = this.buildGraph();
        const schema = this.dataModel.ds.connection.schema;
        const modelPermissions = this.dataModel.ds.metadata.model_granted_roles;
        let query = userQuery.SQLexpression;


        if (modelPermissions.length > 0) {


            const root = this.BuildTree(query);
            const value = this.replaceOnTree(root);

            if (!value) return null;

            const tablesInQuery = this.parseTablesInQuery(userQuery.SQLexpression);
            let tablesNoSchema = this.parseSchema(tablesInQuery, schema);

            /**Mark tables to avoid undesired replaces */
            tablesNoSchema.forEach((table, i) => {
                let whitespaces = `[\n\r\s]*`
                let reg = new RegExp(`${tablesInQuery[i]}` + whitespaces, "g");
                query = query.replace(reg, `┘┘${tablesInQuery[i]}┘┘`);

            });

            tablesNoSchema.forEach((table, i) => {
                query = this.sqlReplacePermissions(query, table, graph, `┘┘${tablesInQuery[i]}┘┘`);
            });

            let reg = new RegExp(`┘┘`, "g");
            query = query.replace(reg, ``);
        }

        //Isolate filters from query
        const filterMarks = [];
        let filter = ''
        let opened = false;
        for (let i = 0; i < userQuery.SQLexpression.length; i++) {
            if (userQuery.SQLexpression[i] === '}') {
                opened = false;
                filter = filter + userQuery.SQLexpression[i];
                filterMarks.push(filter);
                filter = '';
            }
            if (userQuery.SQLexpression[i] === '$' || opened) {
                opened = true;
                filter = filter + userQuery.SQLexpression[i];
            }
        }

        //Get sql formated filters ad types
        const formatedFilters: any[] = [];
        filters.forEach(filter => {
            formatedFilters.push({ string: this.filterToString(filter, 'where'), type: filter.filter_type });
        });

        return this.sqlQuery(query, formatedFilters, filterMarks);
    }

    sqlReplacePermissions = (sqlquery: string, table: string, graph: any, tableWithSchema: string) => {

        const SCHEMA = this.dataModel.ds.connection.schema;
        const origin = table;
        const dest = [];
        const modelPermissions = this.dataModel.ds.metadata.model_granted_roles;
        const permissions = this.getPermissions(modelPermissions, this.tables, origin);

        let tables = this.dataModel.ds.model.tables
            .map(table => { return { name: table.table_name, query: table.query } });

        if (permissions.length > 0) {
            permissions.forEach(permission => {
                if (!dest.includes(permission.filter_table)) {
                    dest.push(permission.filter_table);
                }
            });

            const joinTree = this.dijkstraAlgorithm(graph, origin, dest.slice(0));
            const permissionJoins = this.getJoins(joinTree, dest, tables, SCHEMA);

            let joinsubstitute = '';
            joinsubstitute = this.buildPermissionJoin(origin, permissionJoins, permissions, SCHEMA);

            let whitespaces = `[\n\r\s]*`
            let reg = new RegExp(`${tableWithSchema}` + whitespaces, "g");

            let out = sqlquery.replace(reg, joinsubstitute);
            return out;

        } else {
            return sqlquery;
        }
    }

    cleanComments = (sqlQuery: any) => {
        let reg = new RegExp(/\/\*[^*]*\*+(?:[^*/][^*]*\*+)*\//, "g");
        sqlQuery = sqlQuery.replace(reg, '').split('\n');
        reg = new RegExp(/^\s*(--|#)/, "g");
        let noLineComments = [];
        sqlQuery.forEach(line => {
            if (!line.match(reg)) {
                noLineComments.push(line);
            };
        });
        return noLineComments.join(' ')
    }



    parseTablesInQuery = (sqlQuery: string) => {
        /**remove  comments */
        let reg = new RegExp(/[()]/, 'g')
        sqlQuery = this.cleanComments(sqlQuery).replace(reg, '').replace(/\s\s+/g, ' ') + ' ';
        reg = new RegExp(/\(/, 'g')
        sqlQuery = sqlQuery.replace(reg, ' ( ');
        reg = new RegExp(/\)/, 'g')
        sqlQuery = sqlQuery.replace(reg, ' ) ');
        let words = [];
        let tables = [];

        words = sqlQuery.split(' ');
        for (let i = 0; i < words.length; i++) {
            if (
                (words[i].toUpperCase() === 'FROM' || words[i].toUpperCase() === 'JOIN') &&
                (words[i + 1] !== '(' && words[i + 1].toUpperCase() !== 'SELECT')  // the word that comes after a from and is not a subquery
            ) {
                tables.push(words[i + 1]);
            }
        }
        return tables.filter(this.onlyUnique);
    }


    onlyUnique = (value, index, self) => {
        return self.indexOf(value) === index;
    }

    public createTable(queryData: any) {
        let create = `CREATE TABLE ${queryData.tableName} (\n`;
        queryData.columns.forEach(col => {
            create += `"${this.abc_123(col.field)}" ${col.type},\n`;
        });
        create = create.slice(0, -2);
        create += '\n);'
        return create;
    }

    public abc_123(str: string): string {
        return str.replace(/[^\w\s]/gi, '').replace(/ /gi, '_');
    }

    public generateInserts(queryData: any) {
        let insert = `INSERT INTO ${queryData.tableName} VALUES\n`;
        queryData.data.forEach((register) => {
            let row = '('
            Object.values(register).forEach((value: any, i) => {
                const type = queryData.columns[i].type;
                if (type === 'text') {
                    row += `'${value.replace(/'/g, "''")}',`;
                } else if (type === 'timestamp') {
                    let date = value ? `TO_TIMESTAMP('${value}', '${queryData.columns[i].format}'),` : `${null},`
                    row += `${date}`;
                } else {
                    value = queryData.columns[i].separator === ',' ? parseFloat(value.replace(".", "").replace(",", "."))
                        : parseFloat(value.replace(",", ""));
                    value = value ? value : null;
                    row += `${value},`;
                }
            });
            row = row.slice(0, -1);
            row += ')';
            insert += `${row},`
        });
        insert = insert.slice(0, -1);
        return insert;
    }


    public BuildTree = (query) => {

        let sqlQuery = query.replace(/[\t\n\r]/gm, '');
        sqlQuery = `(${sqlQuery})`;

        let nestedQueries = [];
        let parents = '';

        for (let i = 0; i < sqlQuery.length; i++) {

            if (sqlQuery[i] === '(') parents += '(';
            if (sqlQuery[i] === ')') parents += ')';

            let nested = '';
            let j = i + 1;
            let opened = 0;

            if (sqlQuery[i] === '(') {
                nested += '(';
                opened++;
                while (opened > 0 && j < sqlQuery.length) {
                    nested += sqlQuery[j];
                    if (sqlQuery[j] === '(') { opened++ };
                    if (sqlQuery[j] === ')') { opened-- };
                    j++;
                }
            }
            if (nested.length > 0) {
                nestedQueries.push(nested);
            }
        }

        let root = new TreeNode(nestedQueries[0])
        let stack = [root];
        let node = null;
        let ptr = 1;

        for (let i = 1; i < parents.length; i++) {

            if (parents[i] === '(') {

                let newNode = new TreeNode(nestedQueries[ptr]);

                if (stack.length > 0) {
                    node = stack[stack.length - 1];
                    node.child.push(newNode);
                    stack.push(newNode);
                } else {
                    stack.push(newNode);
                }
                ptr++;

            } else if (parents[i] === ')') {
                stack.pop();
            }
        }
        return root;

    }

    public replaceOnTree = (root) => {

        if (root.child.length === 0) {
            if (!this.checkFormat(root.value)) return false;
            else return true;
        }
        else {
            let str = root.value;
            for (let i = 0; i < root.child.length; i++) {

                const check = this.replaceOnTree(root.child[i]);

                if (check) {
                    str = str.replace(root.child[i].value, ' ___ ');
                } else {
                    return false;
                }

            }
            if (!this.checkFormat(str)) return false;
            else return true;
        }

    }

    public checkFormat = (expression) => {

        //console.log(expression)
        const words = expression.split(/\s+/);
        let currentOperand = '';
        for (let i = 0; i < words.length; i++) {

            let word = words[i].toUpperCase();
            //console.log(word);
            if (
                word === 'FROM'
                || word === 'SELECT'
                || word === 'JOIN'
                || word === 'WHERE'
                || word === 'GROUP'
            ) {
                currentOperand = word;
            }

            if (currentOperand === 'FROM' && word.includes(',')) return false;

        }

        return true;

    }

    public getEqualFilters = (filters) => {
        let filterMap = new Map();
        let toRemove = [];
        filters.forEach(filter => {

            let myKey = filter.filter_table + filter.filter_column + filter.isGlobal;
            let node = filterMap.get(myKey);
            if (node) {
                node.push(filter);
                node.forEach(filter => {
                    if (!toRemove.includes(filter.filter_id)) {
                        toRemove.push(filter.filter_id);
                    }
                })
            } else {
                filterMap.set(myKey, [filter]);
            }

        });
        filterMap.forEach((value, k) => {
             if (value.length < 2) {
                filterMap.delete(k);
            }
        })
        return { map: filterMap, toRemove: toRemove };
    }


    public mergeFilterStrings = (filtersString, equalfilters, type) => {
        if (equalfilters.toRemove.length > 0) {

            equalfilters.map.forEach((value, key) => {
                let filterSTR = '\nand ('
                value.forEach(f => {
                    filterSTR += this.filterToString(f, type) + '\n  or ';
                });

                filterSTR = filterSTR.slice(0, -3);
                filterSTR += ') ';
                filtersString += filterSTR;
            });

        }

        return filtersString;
    }

}
