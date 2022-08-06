import { NextFunction, Request, Response } from 'express';
import DataSource, { IDataSource } from './model/datasource.model';
import Dashboard from '../dashboard/model/dashboard.model';
import { HttpException } from '../global/model/index';
import ManagerConnectionService from '../../services/connection/manager-connection.service';
import ConnectionModel from './model/connection.model';
import { EnCrypterService } from '../../services/encrypter/encrypter.service';
import BigQueryConfig from './model/BigQueryConfig.model';
import CachedQuery, { ICachedQuery } from '../../services/cache-service/cached-query.model';
import { QueryOptions } from 'mongoose';
import { upperCase } from 'lodash';
const cache_config = require('../../../config/cache.config');

export class DataSourceController {

    static async GetDataSources(req: Request, res: Response, next: NextFunction) {
        try {
            DataSource.find({}, (err, dataSources) => {
                if (err) {
                    return next(new HttpException(404, 'Error loading DataSources'));
                }
                const protectedDataSources = [];
                for (let i = 0, n = dataSources.length; i < n; i += 1) {
                    const datasource = dataSources[i];
                    datasource.ds.connection.password = EnCrypterService.decode(datasource.ds.connection.password);
                    datasource.ds.connection.password = '__-(··)-__'; 
                    protectedDataSources.push(datasource);
                }

                return res.status(200).json({ ok: true, ds: protectedDataSources });
            });
        } catch (err) {
            next(err);
        }
    }

    static async GetDataSourcesNames(req: Request, res: Response, next: NextFunction) {
        let options:QueryOptions = {};
        DataSource.find({}, '_id ds.metadata.model_name ds.security', options, (err, ds) => {
            if (!ds) {
                return next(new HttpException(500, 'Error loading DataSources'));
            }

            const names = JSON.parse(JSON.stringify(ds));

            const output = [];

            for (let i = 0, n = names.length; i < n; i += 1) {
                const e = names[i];
                output.push({ _id: e._id, model_name: e.ds.metadata.model_name });
            }
            output.sort((a,b) => (upperCase(a.model_name) > upperCase(b.model_name)) ? 1 : 
            ((upperCase(b.model_name) > upperCase(a.model_name)) ? -1 : 0))
            return res.status(200).json({ ok: true, ds: output });
        });
    }

    static async GetDataSourceById(req: Request, res: Response, next: NextFunction) {
        try {
            DataSource.findById({ _id: req.params.id }, (err, dataSource) => {
                if (err) {
                    return next(new HttpException(404, 'Datasouce not found'));
                }
                // ocultem el password
                dataSource.ds.connection.password = EnCrypterService.decode(dataSource.ds.connection.password);
                dataSource.ds.connection.password = '__-(··)-__';
                

                return res.status(200).json({ ok: true, dataSource });
            });
        } catch (err) {
            next(err);
        }
    }

    /* This function returns the datasources available to make a dashboard.
    Once group and user permissions are filtered. */
    static async GetDataSourcesNamesForDashboard(req: Request, res: Response, next: NextFunction) {

        let options:QueryOptions = {};
        DataSource.find({}, '_id ds.metadata.model_name ds.metadata.model_granted_roles',options, (err, ds) => {
            if (!ds) {
                return next(new HttpException(500, 'Error loading DataSources'));
            }
            const names = JSON.parse(JSON.stringify(ds));
            const output = [];
            for (let i = 0, n = names.length; i < n; i += 1) {
                const e = names[i];
                // Si hay permisos de seguridad.....
                if (e.ds.metadata.model_granted_roles.length > 0) {

                    const userID = req.user._id;
                    const users = [];
                    const roles = [];
                    //Get users with permission
                    e.ds.metadata.model_granted_roles.forEach(permission => {
                        switch(permission.type){
                            case 'anyoneCanSee':
                                if( permission.permission === true ){
                                     output.push({ _id: e._id, model_name: e.ds.metadata.model_name });
                                }
                            break;
                            case 'users':
                                permission.users.forEach(user => {
                                    if (!users.includes(user)) users.push(user);
                                });
                            break;
                            case 'groups':
                                req.user.role.forEach(role => {
                                    if(permission.groups.includes(role)){
                                        if (!roles.includes(role)) roles.push(role);
                                    }
                                });
                        }
                    });

                    if (users.includes(userID) || roles.length > 0) {
                        output.push({ _id: e._id, model_name: e.ds.metadata.model_name });
                    }

                }
                else {

                    output.push({ _id: e._id, model_name: e.ds.metadata.model_name });

                }
            }
            output.sort((a,b) => (upperCase(a.model_name) > upperCase(b.model_name)) ? 1 : 
                                    ((upperCase(b.model_name) > upperCase(a.model_name)) ? -1 : 0))
            return res.status(200).json({ ok: true, ds: output });
        });
    }



    static async UpdateDataSource(req: Request, res: Response, next: NextFunction) {

        try {
            // Validation request
            const body = req.body;
            const psswd = body.ds.connection.password;
            let ds: IDataSource;

            DataSource.findById(req.params.id, (err, dataSource: IDataSource) => {
                if (err) {
                    return next(new HttpException(500, 'Datasouce not found'));
                }

                if (!dataSource) {
                    console.log('Importing new datasource');
                   // return next(new HttpException(400, 'DataSource not exist with id'));
                   ds = new DataSource(body);
                   console.log(body);
                }else{
                    console.log('Importing existing datasource');
                    body.ds.connection.password = psswd === '__-(··)-__' ? dataSource.ds.connection.password : EnCrypterService.encrypt(body.ds.connection.password);
                    dataSource.ds = body.ds;
                    ds = dataSource;
                }            

                //I remove the hidden relationships to optimize the model.
                ds.ds.model.tables.forEach(t => {
                    t.no_relations = t.relations.filter(r => r.visible == false)
                });
                ds.ds.model.tables.forEach(t => {
                    t.relations = t.relations.filter(r => r.visible !== false)
                });
                
                const iDataSource = new DataSource(ds);


                //console.log(dataSource.ds.model.tables);

                iDataSource.save((err, dataSource) => {
                    if (err) {
                        next(new HttpException(500, 'Error updating dataSource'));
                    }

                    return res.status(200).json({ ok: true, message: 'Modelo actualizado correctamente' });
                })
            });

        } catch (err) {
            next(err);
        }
    }

    static async DeleteDataSource(req: Request, res: Response, next: NextFunction) {
        try {
            Dashboard.find({}, (err, dashboards) => {
                const dbds = dashboards.filter(d => d.config.ds._id === req.params.id);
                let stopLoop = false;

                for (let i = 0; i < dbds.length; i++) {
                    if (stopLoop) {
                        return false;
                    }
                    let options:QueryOptions = {};
                    Dashboard.findByIdAndDelete(dbds[i]._id, options, (err, dashboard) => {
                        if (err) {
                            stopLoop = true;
                            return next(new HttpException(500, 'Error removing dashboard'));
                        }
                    });
                }
                let options:QueryOptions = {};
                DataSource.findByIdAndDelete(req.params.id, options, (err, dataSource) => {
                    if (err) {
                        return next(new HttpException(500, 'Error removing dataSource'));
                    }

                    return res.status(200).json({ ok: true, dataSource });
                });
            });
        } catch (err) {
            next(err);
        }
    }

    static async CheckConnection(req: Request, res: Response, next: NextFunction) {

        if (!['postgres', 'mysql', 'vertica', 'sqlserver', 'oracle', 'bigquery', 'snowflake', 'jsonwebservice'].includes(req.qs.type)) {

            next(new HttpException(404, '"Only" postgres, MySQL, oracle, SqlServer, Google BigQuery, Snowflake and Vertica are accepted'));

        } else {

            try {
                const cn = req.qs.type !== 'bigquery' ? new ConnectionModel(req.qs.user, req.qs.host, req.qs.database,
                    req.qs.password, req.qs.port, req.qs.type,
                    req.qs.schema, req.qs.sid, req.qs.warehouse)
                    : new BigQueryConfig(req.qs.type, req.qs.database, req.qs.project_id);

                const manager = await ManagerConnectionService.testConnection(cn);
                await manager.tryConnection();
                return res.status(200).json({ ok: true });
            } catch (err) {
                console.log(err)
                next(new HttpException(500, `Can't connect to database`));
            }

        }
    }

    static async CheckStoredConnection(req: Request, res: Response, next: NextFunction) {
        if (!['postgres', 'mysql', 'vertica', 'sqlserver', 'oracle'].includes(req.qs.type)) {
            next(new HttpException(404, 'Only postgres, MySQL, oracle, SqlServer and Vertica are accepted'));
        } else {
            try {
                const actualDS = await DataSourceController.getMongoDataSource(req.params.id);
                const passwd = req.qs.password === '__-(··)-__' ? EnCrypterService.decode(actualDS.ds.connection.password) : req.qs.password;

                const cn = new ConnectionModel(req.qs.user, req.qs.host, req.qs.database, passwd,
                    req.qs.port, req.qs.type, req.qs.schema, req.qs.sidm, req.qs.warehouse);
                const manager = await ManagerConnectionService.testConnection(cn);
                await manager.tryConnection();
                return res.status(200).json({ ok: true });
            } catch (err) {
                console.log(err)
                next(new HttpException(500, `Can't connect to database`));
            }

        }
    }

    static async GenerateDataModel(req: Request, res: Response, next: NextFunction) {

        if (req.body.type === 'bigquery') {

            return DataSourceController.GenerateDataModelBigQuery(req, res, next);
        } else {
            return DataSourceController.GenerateDataModelSql(req, res, next);
        }
    }

    static async GenerateDataModelBigQuery(req: Request, res: Response, next: NextFunction) {
        try {

            const cn = new BigQueryConfig(req.body.type, req.body.database, req.body.project_id);
            const manager = await ManagerConnectionService.testConnection(cn);
            const tables = await manager.generateDataModel(req.body.optimize,  req.body.filter);


            const CC = req.body.allowCache === 1 ? cache_config.DEFAULT_CACHE_CONFIG : cache_config.DEFAULT_NO_CACHE_CONFIG

            const datasource: IDataSource = new DataSource({
                ds: {
                    connection: {
                        type: req.body.type,
                        host: null,
                        port: null,
                        database: req.body.database,
                        schema: req.body.database || manager.GetDefaultSchema(),
                        project_id: req.body.project_id,
                        searchPath: req.body.project_id || manager.GetDefaultSchema(),
                        user: null,
                        password: null,
                        sid: null,
                        warehouse:null
                    },
                    metadata: {
                        model_name: req.body.name,
                        model_id: '',
                        model_granted_roles: [],
                        optimized: req.params.optimize === '1',
                        cache_config : CC
                    },
                    model: {
                        tables: tables
                    }
                }
            });

            datasource.save((err, data_source) => {
                if (err) {
                    return next(new HttpException(500, `Error saving the datasource`));
                }

                return res.status(201).json({ ok: true, data_source_id: data_source._id });
            });


        } catch (err) {
            next(err);
        }
    }

    static async GenerateDataModelSql(req: Request, res: Response, next: NextFunction) {
      
        try {
            const cn = new ConnectionModel(req.body.user, req.body.host, req.body.database,
                req.body.password, req.body.port, req.body.type, req.body.schema, req.body.sid,  req.qs.warehouse);
            const manager = await ManagerConnectionService.testConnection(cn);
            const tables = await manager.generateDataModel(req.body.optimize, req.body.filter, req.body.name);
            const CC = req.body.allowCache === 1 ? cache_config.DEFAULT_CACHE_CONFIG : cache_config.DEFAULT_NO_CACHE_CONFIG;


            const datasource: IDataSource = new DataSource({
                ds: {
                    connection: {
                        type: req.body.type,
                        host: req.body.host,
                        port: req.body.port,
                        database: req.body.database,
                        schema: req.body.schema || manager.GetDefaultSchema(),
                        searchPath: req.body.schema || manager.GetDefaultSchema(),
                        user: req.body.user,
                        password: EnCrypterService.encrypt(req.body.password || 'no'),
                        sid: req.body.sid,
                        warehouse: req.body.warehouse
                    },
                    metadata: {
                        model_name: req.body.name,
                        model_id: '',
                        model_granted_roles: [],
                        optimized: req.params.optimize === '1',
                        cache_config :CC,
                        filter:req.body.filter
                    },
                    model: {
                        tables: tables
                    }
                }
            });

            datasource.save((err, data_source) => {
                if (err) {
                    console.log(err);
                    return next(new HttpException(500, `Error saving the datasource`));
                }

                return res.status(201).json({ ok: true, data_source_id: data_source._id });
            });

        } catch (err) {
            next(err);
        }
    }

    static async getMongoDataSource(id: string) {

        try {
            return await DataSource.findById(id, (err, dataSource: IDataSource) => {
                if (err) {
                    throw Error();
                }
                return dataSource;
            })
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
    /** Refresh the data model from the source database. The mysql, postgres, oracle, json websercive, etc source...  */
    static async RefreshDataModel(req: Request, res: Response, next: NextFunction) {
        try {

            const actualDS = await DataSourceController.getMongoDataSource(req.params.id);
            const passwd = req.body.password === '__-(··)-__' ? EnCrypterService.decode(actualDS.ds.connection.password) : req.body.password

            const cn = new ConnectionModel(req.body.user, req.body.host, req.body.database, passwd,
                req.body.port, req.body.type, req.body.schema, req.body.sid,  req.qs.warehouse);
            const manager = await ManagerConnectionService.testConnection(cn);
            const storedDataModel = JSON.parse(JSON.stringify(actualDS));
            let tables = [];

            if(storedDataModel.ds.connection.type =='jsonwebservice' ){
                // json webservice get the table name form the model name.... 
                tables = await manager.generateDataModel(storedDataModel.ds.metadata.optimized,storedDataModel.ds.metadata.filter,storedDataModel.ds.metadata.model_name );
            }else{
                tables = await manager.generateDataModel(storedDataModel.ds.metadata.optimized,storedDataModel.ds.metadata.filter);
            }
           

            const datasource: IDataSource = new DataSource({
                ds: {
                    connection: {
                        type: req.body.type,
                        host: req.body.host,
                        port: req.body.port,
                        database: req.body.database,
                        schema: req.body.schema || manager.GetDefaultSchema(),
                        searchPath: req.body.schema || manager.GetDefaultSchema(),
                        user: req.body.user,
                        password: passwd,
                        sid: req.body.sid,
                        warehouse:req.body.warehouse
                    },
                    metadata: {
                        model_name: req.body.name,
                        model_id: '',
                        model_granted_roles: [],
                        optimized: storedDataModel.ds.metadata.optimized
                    },
                    model: {
                        tables: tables
                    }
                }
            });

            // For the stored datasource... i join the relations && no_relations array to compare it
            storedDataModel.ds.model.tables.forEach(t => {
                if (t.no_relations) {
                    t.relations = t.relations.concat(t.no_relations);
                }
            });

            const out = DataSourceController.FindAndUpdateDataModel(datasource.ds.model.tables, storedDataModel.ds.model.tables);
            datasource.ds.model.tables = DataSourceController.FindAndDeleteDataModel(datasource.ds.model.tables, out);


            DataSource.findById(req.params.id, (err, dataSource: IDataSource) => {
                if (err) {
                    return next(new HttpException(500, `Error updating the datasource`));
                }

                dataSource.ds.model.tables = datasource.ds.model.tables;

                const iDataSource = new DataSource(dataSource);

                iDataSource.save((err, saved) => {
                    if (err) {
                        return next(new HttpException(500, `Error updating the datasource`));
                    }

                    if (!saved) {
                        return next(new HttpException(500, `Error in the save datasource`));
                    }

                    return res.status(200).json({ ok: true, message: out });
                });

            });
        } catch (err) {
            next(err);
        }
    }

    static async removeCacheFromModel(req: Request, res: Response, next: NextFunction){
        try{
            const queries = await CachedQuery.deleteMany({ 'cachedQuery.model_id':  req.body.id }).exec();
            console.log(queries);
            return res.status(200).json({ ok: true});
        }catch(err){
            next(err);
        }

    }

    static FindAndUpdateDataModel(referenceModel, updatedDataModel) {
        referenceModel.forEach(rTable => {
            const uTable = updatedDataModel.filter(t => t.table_name === rTable.table_name)[0];
            if (uTable) {
                let column = [];
                rTable.columns.forEach(r_column => {
                    column = uTable.columns.filter(c => {
                        return c.column_name === r_column.column_name;
                    });
                    if (!column.length) {

                        uTable.columns.push(r_column);
                    }
                });
                uTable.tableCount = rTable.tableCount;

            } else {
                updatedDataModel.push(rTable);
            }
        });
        return updatedDataModel;
    }

    static FindAndDeleteDataModel(referenceModel, updatedDataModel) {
        let out = updatedDataModel;
        let toDelete = [];
        out.forEach(uTable => {
            let rTable = referenceModel.filter(t => t.table_name === uTable.table_name)[0];
            if (rTable) {
                let column = [];
                uTable.columns.forEach(uColumn => {
                    column = rTable.columns.filter(c => c.column_name === uColumn.column_name);

                    if (!column.length && !uColumn.computed_column) {
                        uTable.columns = uTable.columns.filter(c => c.column_name !== uColumn.column_name);
                    } else if (column.length) {
                        uColumn.tableCount = column[0].tableCount;
                    }
                });
            } else if (uTable.table_type !== 'view') {
                toDelete.push(uTable.table_name);
            }
        });
        return out.filter(t => !toDelete.includes(t.table_name));

    }

}
