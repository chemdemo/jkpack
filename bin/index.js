#!/usr/bin/env node

'use strict'

const program = require('commander')

const path = require('path')
const fs = require('fs')

const pack = require('../lib/pack')
const pkg = require('../package.json')

const globalConfPath = path.resolve(process.env.HOME || '', '.pack.json')
const localConfPath = path.resolve(process.cwd(), '.pack.json')
const globalConf = fs.existsSync(globalConfPath) ? require(globalConfPath) : {}
const localConf = fs.existsSync(localConfPath) ? require(localConfPath) : {}

program
    .version(pkg.version)
    .description(pkg.description)
    .option('-n, --name [value]', '项目名（即jenkins job名称）')
    .option('-u, --username [value]', 'OA账号名称')
    .option('-p, --password [value]', 'OA账号密码')
    .option('-i, --issueId [n]', 'redmine测试单id')
    .option('-m, --message [value]', '提交到redmine测试单的文本信息')
    .parse(process.argv)

pack(Object.assign(globalConf, localConf, {
    name: program.name,
    // name: 'game-developer',
    // name: 'iUc-20160321',
    // name: 'node',
    username: program.username || process.env['USERNAME'],
    password: program.password,
    issueId: program.issueId, // 474193
    message: program.message // [gitlog] | sth
}))

