import { Request, Response, NextFunction } from 'express';
const qs = require('qs');

export const callInterceptor = function(req: Request, res: Response, next: NextFunction) {
    // as of version 4.17.2 of @types/express and express-serve-static-core the query is no longer year and becomes type
    // due to this the api give a compilation error. To solve this problem we use the qs package that
    // it converts the query into an object of type year, and from the apis we only use req.qs
    req.qs = qs.parse(req.query);
    req.query = undefined;

    next();
}
