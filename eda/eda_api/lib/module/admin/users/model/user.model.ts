import mongoose from 'mongoose';
import { IGroup } from '../../groups/model/group.model';
const uniqueValidator = require('mongoose-unique-validator');

const roles = {
    values: ['EDA_ADMIN_ROLE', 'EDA_USER_ROLE'],
    message: '{VALUE} it is not an allowed role'
};


export interface IUser extends mongoose.Document {
    name: String;
    email: String;
    password: String;
    img: String;
    role: any;
}


const UserSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'Name is required'] },
    email: { type: String, unique: true, required: [true, 'The email is required'] },
    password: { type: String, required: [true, 'Password is required'] },
    img: { type: String, required: false },
    role: [{ type: mongoose.Types.ObjectId, ref: 'Group' }],
}, { collection: 'users', strict: false });

UserSchema.plugin(uniqueValidator, { message: 'There is already a user with this {PATH}' });

export default mongoose.model<IUser>('User', UserSchema);

