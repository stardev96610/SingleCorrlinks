const { fork } = require('child_process')

const { RestClient } = require('@signalwire/node');
const db = require('./database')
const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer-extra')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const Keyword = require('./keywords');
// const replySMS = require('./replySMS');
client = new RestClient("b2973d44-31f1-4c87-8f77-dbbe49b347af",
    "PTfb041e2b957431da84be8c062d1b1d72a319f134c906cc62", {
        signalwireSpaceUrl: 'ojochat.signalwire.com',
    });

process.on('message', msg => {
    if (msg.monitor) {
        monitorSendMessages(msg.cookies);
    }
    if (msg.start) {
        saveSMS(msg.cookies);
    } else if (msg.phone) {
        // let message = "Please insert Phone Number on first line!";
        // replySMS(msg.cookies, message, msg.inmateNumber);
        console.log("There is no phone number in message");
    }
});

async function monitorSendMessages(cookies) {
    setInterval(() => {
        db.query(`SELECT * FROM sms WHERE unread=1 LIMIT 1`, (error, row) => {
            if (row.length) {
                console.log("from: ", row[0].sender);
                console.log("to: ", row[0].recipient);
                let phoneNumber = row[0].recipient.replace(/[^0-9]/g, '');
                phoneNumber = "+" + phoneNumber;

                db.query(`SELECT * FROM inmates WHERE number="${row[0].sender}"`, (error, user) => {

                    if (user.length) {
                        sendSMS(user[0].phone_number, row[0].recipient, row[0].content, row[0].id);
                    } else {

                        db.query(`UPDATE sms SET unread = 2 WHERE id=${row[0].id}`, (error) => {

                        })
                    }
                })
            } else {
                db.query(`UPDATE sms SET unread=1 WHERE unread=2`, (error, user) => {

                });
                // console.log('no SMS in DB');
            }
        });
    }, 10000)
}

async function saveSMS(cookies) {
    try {
        // Use cookies in other tab or browser
        const browser = await puppeteer.launch({
            headless: true,
            devtools: false,
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

        const page = await browser.newPage();
        await page.setCookie(...cookies);
        await page.goto('https://www.corrlinks.com/Inbox.aspx?UnreadMessages'); // Open unreadMessageList page
        // await page.goto('https://www.corrlinks.com/Mailbox.aspx'); // Opens page as logged user
        // const inboxBtn = await page.waitForSelector('#ctl00_contentPanel > div > table > tbody > tr:nth-child(2) > td > a:nth-child(2)')
        // await inboxBtn.click();
        // await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 0 });
        // console.log("inbox is opened");
        await page.screenshot({ path: 'unreadBox.png' });

        while (true) {

            while (true) {
                try {
                    const unreadRow = await page.waitForSelector('#ctl00_mainContentPlaceHolder_inboxGridView > tbody > tr:nth-child(2) ', { timeout: 60000 });

                    // const unreadSpan = await page.waitForSelector('tr td ', { timeout: 60000 });
                    // const unreadCheck = (await unreadSpan.$x('..'))[0];
                    // const unreadRow = (await unreadCheck.$x('..'))[0];
                    // var messageId = await page.evaluate(async () => {
                    //     let element = document.querySelector('#ctl00_mainContentPlaceHolder_inboxGridView');
                    //     let row = element.querySelector('tr td span[isunreadmessage="True"]').closest('tr');
                    //     if (row) {
                    //         return row.getAttribute('MessageId');
                    //     }
                    // });
                    await unreadRow.click();
                    break;
                } catch (error) {
                    // console.log('no unread message in inBox');
                    await page.reload();
                    // await browser.close();
                    // process.send({
                    //     unread: true
                    // });
                }
            }

            var panel;
            do {
                panel = await page.$$('#ctl00_mainContentPlaceHolder_messagePanel');
            } while (panel.length == 0);
            console.log('Message detailpage is opened');
            const messageData = await page.evaluate(async() => {
                var from = document.querySelector('#ctl00_mainContentPlaceHolder_fromTextBox').value || '';
                var date = document.querySelector('#ctl00_mainContentPlaceHolder_dateTextBox').value || '';
                var subject = document.querySelector('#ctl00_mainContentPlaceHolder_subjectTextBox').value || '';
                var message = document.querySelector('#ctl00_mainContentPlaceHolder_messageTextBox').value || '';
                // var phoneNumber = message.slice(0, message.indexOf('\n'));

                return JSON.stringify({ from, date, subject, message });
            });
            console.log('get Message body OK');
            let fromInmateNumber = JSON.parse(messageData).from.replace(/[^0-9]/g, '');
            fs.writeFileSync('message.json', messageData);
            let data = JSON.parse(messageData).message;
            let phoneNumber = data.slice(0, data.indexOf('\n'));
            let keywordList = await Keyword.getKeys();
            console.log(keywordList);
            timeout(3000, true);
            console.log(keywordList);
            console.log("First Line content: ", phoneNumber);
            console.log("-----------------------------------------")
            if (keywordList.includes(phoneNumber.toLowerCase())) {
                let keyword = phoneNumber.toLowerCase();
                let inmateNumber = fromInmateNumber;
                db.query(`SELECT content from keywords where keyword="${phoneNumber.toLowerCase()}"`, (error, content) => {
                    if (content.length) {
                        db.query(`INSERT INTO messages (sender, recipient, content, unread) VALUES ("${keyword}", "${inmateNumber}", "${content[0].content.replace(/"/g, '\\"')}", 1)`, (error, item) => {
                            console.log(item.insertId, "Keyword reply message saved correctly");
                        });
                    }
                });
            } else {
                let recipient = phoneNumber.replace(/[^0-9]/g, '');
                let content = data.slice(data.indexOf('\n') + 1, data.indexOf('-----'));
                content = content.replace(/"/g, '\\"');
                if (recipient.length == 11)
                    recipient = "+" + recipient;
                else if (recipient.length == 10)
                    recipient = "+1" + recipient;
                else
                    recipient = '';
                console.log("recipient:", recipient);
                if (fromInmateNumber && recipient && content) {
                    db.query(`INSERT INTO sms (sender, recipient, content, unread) VALUES ("${fromInmateNumber}", "${recipient}", "${content}", 1)`, (error, item) => {
                        if (error) console.log(error);
                        console.log(item.insertId, " : SMS is recorded successfully in db");
                    });
                }
            }
            await page.reload();
        }
    } catch (error) {
        console.log(error)
    }
}

async function sendSMS(sender, recipient, content, smsId) {
    do {
        let message = client.messages.create({
            from: sender,
            body: content.slice(0, 1590),
            to: recipient
        }).then(msg => {
            console.log(msg.sid);
            db.query(`DELETE FROM sms WHERE id=${smsId}`, (error, item) => {
                db.query(`UPDATE inmates SET send_count = send_count+1 WHERE phone_number="${sender}"`, (error, count) => {
                    if (error) console.log(error);
                });
                console.log('the SMS was sent correctly');
            });
        }).done();
        content = content.slice(1590);
    } while (content.length);
}

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