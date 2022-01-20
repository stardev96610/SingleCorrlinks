const { fork } = require('child_process')

const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer-extra')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')

const express = require('express');
const app = express();
const db = require('./database');
const keyword = require('./keywords');

puppeteer.use(
    RecaptchaPlugin({
        provider: {
            id: '2captcha',
            token: '4c15b2d5f29a19a1c19c408ed295503b' // REPLACE THIS WITH YOUR OWN 2CAPTCHA API KEY ⚡
        },
        visualFeedback: true // colorize reCAPTCHAs (violet = detected, green = solved)
    })
)

app.get('/', function (req, res) {
    res.send('Hello');
});

app.get('/webhook', function (req, res) {
    let data = req.query.Body.replace(/"/g, '\\"');

    if (req.query.From && req.query.To && req.query.Body) {
        db.query(`INSERT INTO messages (sender, recipient, content, unread) VALUES ("${req.query.From.slice(1)}", "${req.query.To.slice(1)}", "${data}", 1)`, (error, item) => {
            console.log(item.insertId, "reply message saved correctly");
            res.send(JSON.stringify(req.query));
        });
    }
});

let server = app.listen(8080, function () {
    var host = server.address().address;
    var port = server.address().port
    console.log("Example app listening at http://%s:%s", host, port);
});


(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            devtools: true,
            args: [
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list'
            ]
        });
        // const browser = await puppeteer.launch();
        const page = await browser.newPage()

        const response = await page.goto('https://www.corrlinks.com/Login.aspx', { waitUntil: 'load', timeout: 0 });
        try {
            const inputEmail = await page.waitForSelector('#ctl00_mainContentPlaceHolder_loginUserNameTextBox')
            await inputEmail.type('mikelee001@bouncesms.com')
            // await inputEmail.type('trepordie.com@gmail.com')

            const inputPassword = await page.waitForSelector('#ctl00_mainContentPlaceHolder_loginPasswordTextBox')
            await inputPassword.type('Aa187187')

            const submitBtn = await page.waitForSelector('#ctl00_mainContentPlaceHolder_loginButton')
            await submitBtn.click()

            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 });
            console.log('recapcha started');
	await page.solveRecaptchas();

            console.log('recapcha passed');
            const proceedBtn = await page.waitForSelector('#ctl00_mainContentPlaceHolder_captchaFNameLNameSubmitButton');
            await proceedBtn.click();
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 });
            // const messageBtn = await page.waitForSelector('#ctl00_mainContentPlaceHolder_mailboxImageButton')
            // await messageBtn.click();
            // await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 });

            // Get cookies
            let cookies = await page.cookies();
            console.log('Get Cookie is OK');
            
            const sendSMS = fork(path.join(__dirname, 'sendSMS'));
            sendSMS.send(
                {
                    start: true,
                    monitor: true,
                    cookies: cookies,
                }
            );
            sendSMS.on('message', async msg => {
                if (msg.unread) {
                    console.log('sendSMS is restarted with new cookies');
                    sendSMS.send({
                        start: true,
                        cookies: cookies
                    })
                }
            })

            const replySMS = fork(path.join(__dirname, 'replySMS'));
            replySMS.send(
                {
                    start: true,
                    cookies: cookies,
                }
            );

            replySMS.on('message', async msg => {
                if (msg.replyError) {
                    console.log('reply Error');
                    replySMS.send({
                        start: true,
                        cookies: cookies
                    })
                }
            });
            setInterval(async () => {
                await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] })
                cookies = await page.cookies();
            }, 100000);

        } catch (error) {
            console.log(error);
            
        }
    } catch (error) {
        try { await browser.close() } catch (error) { }
        console.log(error);
        console.log('Main Browser is closed')
    }
})()

async function timeout(ms, logTimer) {
    if (logTimer) console.log(`Tempo: ${ms / 1000}`)
    async function timer(time, logTimer) {
        if (time >= 0) {
            if (logTimer) console.log(`Aguardando: ${time}`)
            await new Promise(resolve => setTimeout(resolve, 1000))
            return await timer(--time, logTimer)
        }
    }
    await timer(ms / 1000, logTimer)
}


