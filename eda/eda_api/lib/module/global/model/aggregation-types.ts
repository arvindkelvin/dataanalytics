export class AggregationTypes {
        static getValues(){
                return   [
                        { value: 'sum', display_name: 'Sum' },
                        { value: 'avg', display_name: 'Aveg' },
                        { value: 'max', display_name: 'Max' },
                        { value: 'min', display_name: 'Min' },
                        { value: 'count', display_name: 'Count' },
                        { value: 'count_distinct', display_name: 'Unique Count' },
                        { value: 'none', display_name: 'None' }
                   ];
        }
}


