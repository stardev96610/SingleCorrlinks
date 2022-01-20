const db = require('./database')
exports.getKeys = () => {
    return new Promise(resolve => {
        db.query(`SELECT keyword FROM keywords`, (error, keywords) => {
            resolve(keywords.map(item => item.keyword.toLowerCase()));
        });
    })
}