const { application } = require('express');
const Cache = require('./Cache')
const https = require('https')
const url = require('url');

const venmo_sdk_client_id = '604f55ec-10a9-4463-a7cd-5976ec2f60fa'
const venmo_client_id = 'AYxSef8wNXn6JNjjuiluQWN1F9qa2RHYnkx0aKqpPyZyFWTO6559hikB74xQCiswwU_UsYKEpjgr56qE'
const code_verifier = 'teFmHmCRhMjU2OEUgoBGqND-Onsxpl0Z2DwqU1MIx2YFKeg8GyfT5mq82a0rav-QzYLcAl3zUpk2IgEA0KXUkGYiuLtCtDRxJiGf8YZGBEgNUyDTbimAIOx2a.a7Y3u9'
const venmo_redirect_uri = 'venmotest://login.callback'
const zettle_client_id = 'AXztLXOkAAsvAY6mSboxrwUF6pLE8dXPmSEOP8i-pn_kY8VmPDeU8CrMEFg96cp3n1pVn6sjg3skGZMx'

class TokenExchanger {
    init(app) {
        app.post("/exchange",(req,resp) => {
            if(req.body.code) this.exchangeAuthCodeToTokenFromPPCode(req,resp);
            else this.exchangeAuthCodeToToken(req, resp)
        });
    }

    sendError(resp, message, prev, current) {
        resp.status(500).send({
            error: message,
            prev: prev,
            current: current
        });
    }

    exchangeAuthCodeToToken(req, resp) {
        const queryObject = url.parse(req.url, true).query;

        this.getJWTTokenForBusinessUser(req, (jwtdata) => { //4.
            if(jwtdata.statusCode != 200 || jwtdata.data === null) {
                this.sendError(resp,'Unable to get JWT Token for Business User',{}, jwtdata);
            } else {
                this.convertJWTToZUAT(jwtdata, (uatdata) => { //5.
                    if(uatdata.statusCode != 200 || uatdata.data === null) {
                        this.sendError(resp,'Unable to get convert JWT to UAT', jwtdata, uatdata);
                    } else {
                        this.convertPPACToZAC(uatdata, (acdata) => {//7.
                            if(acdata.statusCode != 303 || acdata.izsessionat === null) {
                                this.sendError(resp,'Unable to convert PP Auth Code to Z Auth Code',uatdata, acdata);
                            } else {
                                this.convertZSessionToAC(acdata, (sessionacdata) => {//8.
                                    if(sessionacdata.statusCode != 302 || sessionacdata.zettleAuthCode === undefined) {
                                        this.sendError(resp,'Unable to convert Z Session to Z Auth Code',acdata, sessionacdata);
                                    } else {
                                        this.convertZACZAT(sessionacdata, (atdata) => {//9.
                                            if(atdata.statusCode != 200 || atdata.token === undefined) {
                                                this.sendError(resp,'Unable to convert Z Auth Code to Access Token',sessionacdata, atdata);
                                            }else {
                                                resp.send(atdata.token);
                                            }
                                        })
                                    }
                                })
                            }
                
                        });
                    }
                })
            }
        })
    }

    exchangeAuthCodeToTokenFromPPCode(req, resp) {
        const uatdata = {
            data: {
                code: req.body.code
            }
        }
        this.convertPPACToZAC(uatdata, (acdata) => {//7.
            if(acdata.statusCode != 303 || acdata.izsessionat === null) {
                this.sendError(resp,'Unable to convert PP Auth Code to Z Auth Code',uatdata, acdata);
            } else {
                this.convertZSessionToAC(acdata, (sessionacdata) => {//8.
                    if(sessionacdata.statusCode != 302 || sessionacdata.zettleAuthCode === undefined) {
                        this.sendError(resp,'Unable to convert Z Session to Z Auth Code',acdata, sessionacdata);
                    } else {
                        this.convertZACZAT(sessionacdata, (atdata) => {//9.
                            if(atdata.statusCode != 200 || atdata.token === undefined) {
                                this.sendError(resp,'Unable to convert Z Auth Code to Access Token',sessionacdata, atdata);
                            }else {
                                resp.send(atdata.token);
                            }
                        })
                    }
                })
            }

        });
    }

    notifyError(error, callback) {
        callback({
            statusCode: 500,
            error: error
        });
    }

    getJWTTokenForBusinessUser(orgreq, callback){
        console.log(`${JSON.stringify(orgreq.body)}`);

        callback({
            statusCode: 200,
            data: orgreq.body
        });
    }

    //skipping this function since we cannot acess pikachu from heroku
    getJWTTokenForBusinessUser_org(orgreq, callback){
        console.log("1. getJWTTokenForBusinessUser");
        const authHeader = orgreq.get('authorization')
        console.log(`Auth: ${authHeader}`);
        if(authHeader === undefined) {
            this.notifyError('No auth header', callback);
            return;
        }
        const options = {
            hostname: "api-pikachu.qa.venmo.com",
            port: "443",
            path: '/v1/users/signed-access-token',
            method: 'GET',
            headers : {
                'Authorization': authHeader,
                'Content-Type' : 'application/json'
            }
        }
        const req = https.request(options, res => {
            console.log(`statusCode: ${res.statusCode}`)
            var chunks = [];
            res.on("data", (chunk) => {
                chunks.push(chunk);
            });

            res.on("end", () => {
                var body = Buffer.concat(chunks);
                console.log(`Body: ${body.toString()}`);

                callback({
                    statusCode: res.statusCode,
                    data: JSON.parse(body.toString())
                });
            });
        })

        req.on('error', error => {
            this.notifyError(error, callback);
        })

        req.end()
    }

    convertJWTToZUAT(jwtdata, callback){
        console.log("2. convertJWTToZUAT");

        let authHeader = Buffer.from(`${venmo_client_id+':'+process.env.VCSECRET}`).toString('base64');
  
        const options = {
            // hostname: "api.msmaster.qa.paypal.com",
            // hostname:"api.te-venmo-zettle-identity.qa.paypal.com",
            hostname : "www.izettle.stage.paypal.com",
            port: "443",
            path: '/v1/oauth2/token',
            method: 'POST',
            headers : {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            }
        }
        const req = https.request(options, res => {
            console.log(`statusCode: ${res.statusCode}`)
            var chunks = [];
            res.on("data", (chunk) => {
                chunks.push(chunk);
            });

            res.on("end", () => {
                var body = Buffer.concat(chunks);
                console.log(body.toString());

                callback({
                    statusCode: res.statusCode,
                    data: JSON.parse(body.toString())
                });
            });
        })

        req.on('error', error => {
            this.notifyError(error, callback);
        })

        var postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&response_type=code&assertion=${jwtdata.data.data}&target_client_id=${zettle_client_id}&redirect_uri=https://login.zettletest.com/oauth`
          
        req.write(postData);
    
        req.end()
    }

    convertPPACToZAC(data, callback) {
        console.log("3. convertPPACToZAC");
        const options = {
            hostname: "login.zettletest.com",
            port: "443",
            path: `/oauth?code=${data.data.code}`,
            // path: `/oauth?code=${data.code}`,
            method: 'GET',
        }
        const req = https.request(options, res => {
            console.log(`statusCode: ${res.statusCode}`)
            const cookies = res.headers['set-cookie'];
            let authcode = null;
            for (var i = 0; i < cookies.length; i++) {
                if(cookies[i].startsWith('_izsessionat')) {
                    console.log(`authcode: ${cookies[i]}`)
                    authcode = cookies[i].split(';')[0].split('=')[1];
                    break;
                }
            }
            console.log(`authcode: ${authcode}`)
            var chunks = [];
            res.on("data", (chunk) => {
                chunks.push(chunk);
            });

            res.on("end", () => {
                var body = Buffer.concat(chunks);
                console.log(body.toString());

                callback({
                    statusCode: res.statusCode,
                    izsessionat: authcode
                });
            });
        })

        req.on('error', error => {
            this.notifyError(error, callback);
        })

        req.end()
    }

    convertZSessionToAC(data, callback) {
        console.log("4. convertZSessionToAC");
        const options = {
            hostname: "oauth.zettletest.com",
            port: "443",
            path: `/authorize?app=payments-sdk&response_type=code&code_challenge_method=S256&locale=en_GB&client_id=${venmo_sdk_client_id}&scope=READ%3APAYMENT%20WRITE%3APAYMENT%20READ%3AUSERINFO&redirect_uri=venmotest%3A//login.callback&state=eyJjYWxsaW5nQWN0aXZpdHlDbGFzcyI6ImNvbS5pemV0dGxlLnBheW1lbnRzLmFuZHJvaWQua290bGluX3NhbXBsZS5NYWluQWN0aXZpdHkiLCJ0YXNrSWQiOiJlYTJkOGRlYS01NmE2LTQ5YjctYmQ5MC00MDA0Y2U1MmVjMmYiLCJ0YXNrVHlwZSI6ImNvbS5pemV0dGxlLmFuZHJvaWQuYXV0aC50YXNrcy5PQXV0aExvZ2luVGFzayJ9&code_challenge=A4b8iHgHarswQYxIezB2Ij5dLSYboX-Y-JmkQ1r82s0&isMobileApp=true&isSdkApp=true`,
            method: 'GET',
            headers: {
                'Cookie': `_izsessionat=${data.izsessionat}`
              },
        }
        const req = https.request(options, res => {
            console.log(`statusCode: ${res.statusCode}`)
            let zettleAuthCode = res.headers['location']?.split('=')[1].split('&')[0]
            console.log(`zettleAuthCode: ${zettleAuthCode}`)
            var chunks = [];
            res.on("data", (chunk) => {
                chunks.push(chunk);
            });

            res.on("end", () => {
                var body = Buffer.concat(chunks);
                console.log(body.toString());

                callback({
                    statusCode: res.statusCode,
                    zettleAuthCode: zettleAuthCode
                });
            });
        })

        req.on('error', error => {
            this.notifyError(error, callback);
        })

        req.end()
    }

    convertZACZAT(data, callback) {
        console.log("5. convertZACZAT");
        var options = {
            'method': 'POST',
            'hostname': 'oauth.zettletest.com',
            'path': '/token',
            'headers': {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            'maxRedirects': 20
          };
          
          var req = https.request(options, function (res) {
            var chunks = [];
          
            res.on("data", function (chunk) {
              chunks.push(chunk);
            });
          
            res.on("end", function (chunk) {
              var body = Buffer.concat(chunks);
              console.log(body.toString());
              var jsonBody  = JSON.parse(body);
              callback({
                statusCode: res.statusCode,
                token: jsonBody
            });
            });
          
            req.on('error', error => {
                this.notifyError(error, callback);
            })
          });
          
          var postData = `grant_type=authorization_code&code=${data.zettleAuthCode}&client_id=${venmo_sdk_client_id}&redirect_uri=${venmo_redirect_uri}&code_verifier=${code_verifier}`;
          
          req.write(postData);
          
          req.end();
    }
}
module.exports = new TokenExchanger();