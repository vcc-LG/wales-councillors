const http = require('http');

const hostname = '127.0.0.1';
const port = 3000;
const fs = require('fs');
const path = require('path')
const readline = require('readline');
const { google } = require('googleapis');
const DataPath = path.join(__dirname, '.data')
const Credentials = path.join(DataPath, 'credentials.json')
const TOKEN_PATH = path.join(DataPath, 'token.json')
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const mongodbHost = 'ds141674.mlab.com';
const mongodbPort = '41674';
const authenticate = 'leo:password1234@';
const mongodbDatabase = 'councillors';
var url = 'mongodb://' + authenticate + mongodbHost + ':' + mongodbPort + '/' + mongodbDatabase;



// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

fs.readFile(Credentials, (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Sheets API.
    authorize(JSON.parse(content), main);
});

function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

function main(auth) {
    const sheets = google.sheets({ version: 'v4', auth });
    //List sheets
    listSheets(auth, function (sheetNames) {
        sheetNames.forEach(function(name){
            getCouncillors(name, auth, function(councillorDictList){
                updateMongo(councillorDictList);
            });
        });

    })

}

function listSheets(auth, callback) {
    const sheets = google.sheets({ version: 'v4', auth });
    sheets.spreadsheets.get({
        spreadsheetId: '1Jgu4uCC3Ni_MhoXVcG_eiCQyJbCiEXC4dFF8LFMnQHo',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        var sheetName = res.data.sheets[0].properties.title;
        var sheetList = [];
        res.data.sheets.forEach(function (e) {
            sheetList.push(e.properties.title)
        });
        callback(sheetList);
    });
}

function getCountyName(sheetName, auth, callback) {
    const sheets = google.sheets({ version: 'v4', auth });
    sheets.spreadsheets.values.get({
        spreadsheetId: '1Jgu4uCC3Ni_MhoXVcG_eiCQyJbCiEXC4dFF8LFMnQHo',
        range: sheetName + '!B1',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        var countyName = res.data.values[0][0];
        callback(countyName);
    });
}

function getCouncilName(sheetName, auth, callback) {
    const sheets = google.sheets({ version: 'v4', auth });
    sheets.spreadsheets.values.get({
        spreadsheetId: '1Jgu4uCC3Ni_MhoXVcG_eiCQyJbCiEXC4dFF8LFMnQHo',
        range: sheetName + '!B2',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        var countyName = res.data.values[0][0];
        callback(countyName);
    });
}

function getSource(sheetName, auth, callback) {
    const sheets = google.sheets({ version: 'v4', auth });
    sheets.spreadsheets.values.get({
        spreadsheetId: '1Jgu4uCC3Ni_MhoXVcG_eiCQyJbCiEXC4dFF8LFMnQHo',
        range: sheetName + '!B3',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        var countyName = res.data.values[0][0];
        callback(countyName);
    });
}

function getCouncillors(sheetName, auth, callback){
    const sheets = google.sheets({ version: 'v4', auth });
    getCountyName(sheetName, auth, function(countyName){
        getCouncilName(sheetName, auth, function(councilName){
            getSource(sheetName, auth, function(sourceURL){
                sheets.spreadsheets.values.get({
                    spreadsheetId: '1Jgu4uCC3Ni_MhoXVcG_eiCQyJbCiEXC4dFF8LFMnQHo',
                    range: sheetName + '!A5:C200',
                }, (err, res) => {
                    if (err) return console.log('The API returned an error: ' + err);
                    var listOfCouncillors = [];
                    res.data.values.forEach(function(el){
                        var dict = {};
                        dict['Ward'] = el[0];
                        dict['Name'] = el[1];
                        dict['Party'] = el[2];
                        dict['County'] = countyName;
                        dict['Council'] = councilName;
                        dict['Source'] = sourceURL;
                        listOfCouncillors.push(dict);
                    });
                    //console.log(listOfCouncillors);
                    callback(listOfCouncillors);
                });
            })
        })
    });

}

function updateMongo(obj) {
    MongoClient.connect(url, function (err, db) {
        if (err) throw err;
        var dbo = db.db(mongodbDatabase);

        dbo.collection("councillors").remove({});

        dbo.collection("councillors").insertMany(obj, function (err, res) {
            if (err) throw err;
            console.log(obj.length + " documents inserted");
            db.close();
        });
    });
}


const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello World\n');
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});