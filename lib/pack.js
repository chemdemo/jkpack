/*
* @Author: dmyang
* @Date:   2016-12-27 17:28:07
* @Last Modified by:   dmyang
* @Last Modified time: 2017-01-12 19:58:35
*/

'use strict'

const path = require('path')
const fs = require('fs')

const FormData = require('form-data')
const chalk = require('chalk')
const { table, getBorderCharacters } = require('table')
const opn = require('opn')

const request = require('./request')
const get = request.get
const post = request.post
const conf = require('./config')

const { JENKINS_ROOT, MAVEN_Q, REDMINE_DOMIN } = conf
const AUTO_GET_COMMIT_FROM_GITLOG = '[gitlog]'

const sleep = ms => {
    return new Promise(resolve => {
        // console.log(`waiting ${ms} ms...`)
        setTimeout(resolve, ms)
    })
}

const gitlog = message => {
    return new Promise(resolve => {
        if(message === AUTO_GET_COMMIT_FROM_GITLOG) {
            const exec = require('child_process').exec

            exec('git log --format="%cn|%s|%H"', { cwd: process.cwd() }, (err, str) => {
                if(err) {
                    if(err.message && /Not a git repository/) console.log('')
                    else console.log('')
                    resolve('Nothing...')
                } else {
                    let msg = str.split(/\n/g)[0]
                    // console.log(msg)
                    resolve(msg.split('|')[0])
                }
            })
        } else {
            message = message ? '\n' + message : ''
            resolve(message + '\r\n> 通过[pack](https://github.com/chemdemo/pack)自动提交')
        }
    })
}

// 触发jenkins构建
const build = project => {
    const buildUri = `${JENKINS_ROOT}/${project}/build?delay=0sec`

    return new Promise(resolve => post(buildUri).then(resolve))
}

// 轮询检查是否打包完成
const buildCheck = project => {
    const pageUri = `${JENKINS_ROOT}/${project}/`

    return new Promise(resolve => {
        sleep(1000)
            .then(() => get(pageUri))
            .then(body => {
                /*body.replace(/Last (successful|failed|)\s*?build\s*?\(#([^\)]+)?\)/g, (m, $1, $2) => {
                    console.log($1, $2)
                })*/
                let m1 = body.match(/Last build\s*?\(#([^\)]+)?\)/)
                let m2 = body.match(/Last successful build\s*?\(#([^\)]+)?\)/)
                let m3 = body.match(/Last failed build\s*?\(#([^\)]+)?\)/)

                if(!m1) {
                    console.log('异常！')
                    process.exit()
                }

                let lastVer = m1[1]
                let succVer = m2 ? m2[1] : 0
                let failedVer = m3 ? m3[1] : 0

                if(lastVer == failedVer) {
                    console.log(chalk.red(`构建失败，请检查项目配置！\n${pageUri}`))
                    process.exit()
                }

                if(lastVer == succVer) resolve()
                else buildCheck(project).then(resolve)
            })
    })
}

// 爬取构建出来的包
const captureAssets = project => {
    // console.log(`start capture ${project}`)

    const listUri = `${JENKINS_ROOT}/${project}/lastSuccessfulBuild/`
    const getArtifactPkg = p => {
        // p = 'com.company.uc$uc-client-login/'
        return new Promise(resolve => {
            get(`${JENKINS_ROOT}/${project}/lastSuccessfulBuild/${p}`)
                .then(body => {
                    let m = body.match(/(<table class="fileList">.+<\/table>)/)
                    let r = {}

                    m = m ? m[1] : ''

                    let re = /<td><a href="([^\"]+)?">([^<]+)?<\/a><\/td>/g
                    let mt

                    while(mt = re.exec(m)) {
                        let u = mt[1]
                        let arr = u ? u.split('/') : []
                        // console.log(arr)

                        if(!r.mod) r.mod = arr[2]

                        // merge version
                        if(!r.ver) {
                            // 1.0.33-20161229.103634-20 => 1.0.33
                            // 4.6.1-RC07-20161229.080132-1 => 4.6.1-RC07
                            let vers = arr[3].split('-')
                            let i = 1

                            if(/RC\d+/.test(vers[1])) i++

                            r.ver = vers.splice(0, i).join('-')
                        }
                    }

                    return r
                })
                .then(info => {
                    // console.log(info)

                    const { mod, ver } = info

                    get(`${MAVEN_Q}q=${mod}-${ver}`).then(body => {
                        let m = body.replace(/\n/g, '').match(/(<tbody>.+<\/tbody>)/)
                        let r = []

                        m = m ? m[1] : ''
                        // console.log(m)

                        let re = /href=&#039;([^&]+)?&#039/g
                        let mt

                        while(mt = re.exec(m)) r.push(mt[1])

                        resolve(r)
                    })
                })
        })
    }

    return new Promise(resolve => {
        const result = {}
        const mods = []

        get(listUri).then(body => {
            body.replace(/\n/g,'').replace(/.+<h2>Module Builds<\/h2>(<table>.+<\/table>).+/g, (m, $1) => {
                $1.replace(/<a href="([^\"]+)?"><img/g, (m, $1) => {
                    mods.push($1)
                })
            })

            if(!mods.length) {
                console.log('构建列表为空！')
                process.exit()
            }
            // console.log(mods, mods.length)

            // getArtifactPkg(mods[mods.length - 1]).then(mods => {console.log(mods)})
            let count = 0
            mods.forEach(p => {
                // console.log(p) // => com.company.uc$uc-client-login/
                let mod = p.split('$')[1].replace('/', '')
                
                getArtifactPkg(p).then(list => {
                    count++
                    result[mod] = list
                    if(count == mods.length) resolve(result)
                })
            })
        })
    })
}

// 打印包列表
const print = map => {
    let data = []
    let lines = [0]

    Object.keys(map).map(mod => {
        lines.push(lines[lines.length - 1] + map[mod].length)

        map[mod].forEach((url, i) => {
            data.push([i == 0 ? chalk.bgCyan(mod) : '', url])
        })
    })

    let output = table(data, {
        border: getBorderCharacters('ramac'),
        drawHorizontalLine: (index, size) => lines.indexOf(index) > -1
    })

    console.log(chalk.cyan('打包完成，包列表：'))
    console.log(output)

    return map
}

// commit包到redmine测试单
const commit = (data, options) => {
    const { username, password, issueId, message } = options
    // console.log(data)

    post(`http://${REDMINE_DOMIN}/login`, {}, {
        utf8: '✓',
        username,
        password,
        login: '登录'
    }, 'getResHeader')
    .then(result => {
        if(typeof result === 'string') {
            if(result.indexOf('无效的用户名或密码') > 0) console.log('OA用户名或密码配置错误！')
            else console.log(result)
            return
        }

        gitlog(message).then(msg => {
            const Cookie = result['set-cookie'][0].split(';')[0]
            // console.log(Cookie)
            const form = new FormData()
            const data2str = () => {
                let s = ''

                Object.keys(data).forEach(mod => {
                    s += `${mod}：\n`
                    data[mod].forEach(u => { s += `${u}\n` })
                })

                return s
            }

            form.append('utf8', '✓')
            form.append('_method', 'patch')
            form.append('issue[notes_format]', 'markdown')
            // form.append('issue[notes]', JSON.stringify(data))
            form.append('issue[notes]', data2str(data) + msg)

            form.submit({
                host: REDMINE_DOMIN,
                path: `/issues/${issueId}`,
                headers: { Cookie }
            }, (err, res) => {
                if(err) return console.log(err.stack)

                let rUrl = `http://${REDMINE_DOMIN}/issues/${issueId}`

                if(res.statusCode == 302 && res.headers['location'] === rUrl) {
                    console.log(chalk.cyan('成功上传到测试单：'))
                    console.log(rUrl)
                    // opn(rUrl)
                } else {
                    console.log(chalk.red('上传失败\n'), res)
                }
            })
        })
    })
}

module.exports = conf => {
    // return console.log(conf)
    const { name, username, password, issueId } = conf

    if(!name) {
        console.warn(chalk.red('project name required'))
        process.exit()
    }

    build(name)
        .then(() => console.log(chalk.cyan('正在检测是否构建完成，请稍等...')))
        .then(() => buildCheck(name))
        .then(() => console.log(chalk.cyan('构建完成，正在获取output包，请稍等...')))
        .then(() => captureAssets(name))
        .then(print)
        .then(data => {
            if(username && password && issueId) commit(data, conf)
            else console.log('没有配置相关信息，忽略自动上传到redmine测试单。')
        })
        .catch(e => {
            console.log(chalk.red('程序运行出错：'))
            console.log(e.stack)
        })
}
