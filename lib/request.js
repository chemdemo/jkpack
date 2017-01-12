/*
* @Author: yangdemo
* @Date:   2016-11-30 16:05:10
* @Last Modified by:   dmyang
* @Last Modified time: 2016-12-30 16:35:07
*/

'use strict'

const http = require('http')
const https = require('https')
const url = require('url')
const qs = require('querystring')

// JWT
const _cookies = {}

/**
 * HTTP request client
 * @param {String} method    method
 * @param {String} u         url
 * @param {Object} headers   request headers
 * @param {Object} postData  post body
 * @param {Boolean} getResHeader  
 */
const request = (method, u, headers = {}, postData = {}, getResHeader = false) => {
    let parsed = url.parse(u)
    let postBody = qs.stringify(postData)
    let options = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.path,
        method,
    }

    if('POST' === method) headers = Object.assign(headers, {'Content-Length': Buffer.byteLength(postBody)})

    if(headers) options.headers = headers

    return new Promise(resolve => {
        let req = (/^https/.test(u) ? https : http).request(options.headers ? options : u, res => {
            if(/30(1|2)/.test(res.statusCode)) {
                if(getResHeader) resolve(res.headers)
                else request(method, res.headers['location'], headers, postData).then(resolve)
                return
            }

            if(!/20\d/.test(res.statusCode)) {
                console.warn(`${method.toUpperCase()} ${u} statusCode ${res.statusCode}`)

                if(res.statusCode == 404) console.log('项目名称配置错误！')

                process.exit()
            }

            let chunks = []

            res.on('data', chunk => chunks.push(chunk))

            res.on('end', () => {
                let buf = Buffer.concat(chunks)

                resolve(buf.toString())
            })

            res.on('error', err => {
                console.log('响应出错\n', err)
                process.exit()
            })
        })

        // req.setTimeout(5000, () => reject(`request ${u} timeout`))

        req.on('error', err => {
            console.log('请求出错\n', err)
            process.exit()
        })

        if('POST' === method) req.write(postBody)

        req.end()
    })
}

const get = (u, headers, getResHeader) => request('GET', u, headers, getResHeader)
const post = (u, headers, postData, getResHeader) => request('POST', u, headers, postData, getResHeader)

exports.request = request
exports.get = get
exports.post = post
