import ActiveDirectory from 'activedirectory2'
import { UserActiveDirectoryModel } from './model/user-active-directory.model'
import path from 'path'
import fs from 'fs'
import _ from 'lodash'
import { roleGuard } from 'guards/role-guard'
import { GroupActiveDirectoryModel } from './model/group-active-directory.model'
import Group, { IGroup } from './../../module/admin/groups/model/group.model'

let adconfig

export class ActiveDirectoryService {
  static async login (
    username: string,
    password: string
  ): Promise<UserActiveDirectoryModel> {
    await ActiveDirectoryService.verifyAdConfig()

    const ad = new ActiveDirectory(adconfig)
    return new Promise((resolve, reject) => {
      ad.authenticate(
        adconfig.userNamePrefix + username,
        password,
        async (err, auth) => {
          if (auth) {
            const userGroupAd = await ActiveDirectoryService.userAdGroups(
              username
            )
            if (!_.isNil(userGroupAd.roleUsuari)) {
              const response = await ActiveDirectoryService.userAdInfo(username)
              response.groups = userGroupAd.groups
              response.userRole = userGroupAd.roleUsuari
              if (userGroupAd.roleAdmin) {
                response.adminRole = userGroupAd.roleAdmin
              }
              resolve(response)
            } else {
              const response: any = {}
              response.err = `This user does not have EDA_USER_ROLE`
              reject(response)
            }
          } else {
            const response: any = {}
            console.log(err)
            if (err) {
              response.err = err
            } else {
              response.err = 'Authentication failed'
            }

            let error: any = {}

            if (
              JSON.stringify(response.err)
                .toString()
                .includes('data 52e')
            ) {
              error = {
                code: 401,
                message: 'Incorrect username or password''
              }
            } else if (
              JSON.stringify(response.err)
                .toString()
                .includes('data 775')
            ) {
              error = {
                code: 401,
                message: 'User blocked'
              }
            } else {
              error = {
                code: 401,
                message: 'Authentication failed'
              }
            }

            reject(error)
          }
        }
      )
    })
  }

/** If I have to search for the user by the sAMAccountName, I have to retrieve the user and then return the main name that is actually used by the AD */
  static async getUserName (
    username: string
  ): Promise<string> {
    await ActiveDirectoryService.verifyAdConfig();
    if(adconfig.querysAMAccountName == "true"){

      await ActiveDirectoryService.verifyAdConfig()
      const ad = new ActiveDirectory(adconfig)
  
      return new Promise((resolve, reject) => {
        ad.findUser( username, (err: any, user: any) => {
          if (user) {
            const response =  user.userPrincipalName;
              resolve(response);
          } else {
            console.log(err);
            const response: any = {}
  
            if (err) {
              response.err = err
            } else {
              response.err = 'User ' + username + ' not found'
            }
  
            reject(response);
          }
        })
      })

    }else{

      //If I don't have to look up the user in AD, I simply return the user that was passed to me
      return new Promise((resolve, reject) => {
        resolve(username);
      })



      
    }

  }


  static async userAdInfo (
    username: string
  ): Promise<UserActiveDirectoryModel> {
    await ActiveDirectoryService.verifyAdConfig()
    const ad = new ActiveDirectory(adconfig)

    return new Promise((resolve, reject) => {
      ad.findUser(undefined, username, (err: any, user: any) => {
        if (user) {
          const response = new UserActiveDirectoryModel({
            username,
            displayName: user.displayName,
            email: user.mail
          })

          resolve(response)
        } else {
          const response: any = {}

          if (err) {
            response.err = err
          } else {
            response.err = 'User ' + username + ' not found'
          }

          reject(response)
        }
      })
    })
  }


  static async getADGroups (): Promise<GroupActiveDirectoryModel[]> {
    //const ad = new ActiveDirectory(adconfig);
    const ad = new ActiveDirectory(
                     { url:  adconfig.url,
                      baseDN: adconfig.groupBaseDN ,
                      username: adconfig.username ,
                      password: adconfig.password 
                      } );

    var query = 'CN=*';
                     
    return new Promise((resolve, reject) => {
        ad.findGroups(query, function(err, groups) {
            const adGroups = [];
            if (err) {
                console.log('ERROR: ' +JSON.stringify(err));
                reject();
            }
        
            if ((! groups) || (groups.length == 0)){ console.log('No groups found.');  
            }else {
               const adGroups = [];
                groups.forEach( (g:any)=>{
                        adGroups.push( new GroupActiveDirectoryModel( { name: g.cn,
                                        role:  g.cn=='EDA_ADMIN_ROLE'?'EDA_ADMIN_ROLE':'EDA_USER_ROLE' }
                                        ));
                } )
                resolve(adGroups);
            }
            });
    })
  }

  /** Retrieves the groups the user belongs to and returns  */
  static async userAdGroups (username: string): Promise<any> {
    const ad = new ActiveDirectory(adconfig)
    return new Promise((resolve, reject) => {
      ad.getGroupMembershipForUser(username, async (err, groups: any[]) => {
        const user: any = {}
        let userGroups: any = []
        if (groups) {
          for (let i = 0, n = groups.length; i < n; i += 1) {
            const group = groups[i]
            // If I have defined one or more patterns for the EDA groups....
            if (adconfig.groupPatterns) {
              adconfig.groupPatterns.forEach(p => {
                if (group.cn.toString().indexOf(p) >= 0) {
                  userGroups.push(group.cn.toString())
                }
              })
            } else {
              // if I don't have any filters... I put them all
              userGroups.push(group.cn)
            }

            if (group.cn === 'EDA_USER_ROLE') {
              user.username = username
              user.roleUsuari = group.cn
            }

            if (group.cn === 'EDA_ADMIN_ROLE') {
              user.roleAdmin = group.cn
            }
          }
          user.groups = userGroups
          resolve(user)
        }

        const response: any = {}

        if (err) {
          response.err = err
        } else {
          response.err = 'Authentication failed'
        }

        reject(response)
      })
    })
  }



  static verifyAdConfig (): Promise<void> {
    return new Promise((resolve, reject) => {
      const ldapPath = path.resolve(
        __dirname,
        `../../../config/activedirectory.json`
      )

      if (fs.existsSync(ldapPath)) {
        adconfig = require('../../../config/activedirectory.json')
        resolve()
      } else if (!fs.existsSync(ldapPath)) {
        reject(`Error config not found`)
      }
    })
  }
}
