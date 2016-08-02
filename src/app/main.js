"use strict";

const fs = require('fs');
const path = require('path');
const moment = require('moment');
const Datastore = require('nedb');
const electron = require('electron');
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;
const app = electron.app;
const Menu = electron.Menu;
const appMenu = require('./appMenu')(app);

let main;

class Main {

  constructor(bot) {
    this.bot = bot;
    this.mainWindow = null;
    this.activeChannel = null;
    this.retries = 0;

    // debug: print userData path so we know where data files are being stored locally
    console.log(app.getPath('userData'));

    // Create the nedb config db
    this.config = new Datastore({
      filename: path.join(app.getPath('userData'), 'config.db'),
      autoload: true
    });

    app.config = {};

    // App event handlers
    app.on('ready', this.login.bind(this));

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (this.mainWindow === null) {
        this.createWindow();
      }
    });

    // Bot event handlers
    bot.on('ready', this.onReady.bind(this));
    bot.on('error', this.onError.bind(this));
    bot.on('disconnected', this.onDisconnect.bind(this));
  }

  get app() {
    return app;
  }

  /**
   * Login with token or show the token window
   */
  login() {
    this.config.findOne({}, (err, doc) => {
      if (!doc || !doc.token) {
        return this.createTokenWindow();
      }

      this.token = doc.token;
      this.bot.loginWithToken(this.token).then(() => {
        if (!this.mainWindow) {
          this.createWindow();
        }
      }).catch(err => console.log(err));
    });
  }

  /**
   * Client ready event handler
   */
  onReady() {
  }

  /**
   * Client error event handler
   * @param  {Object} err Error
   */
  onError(err) {
    console.error(err);
  }

  /**
   * Client disconnect event handler
   */
  onDisconnect() {
    // retry 3 times
    if (this.retries >= 3) {
      this.retries = 0;
      return this.createTokenWindow();
    }

    this.retries++;

    // debug
    console.log(`Attempting to reconnect... ${this.retries}`);

    // respect reconnect rate limit of 5s
    setTimeout(function() {
      this.login();
    }.bind(this), 5000);
  }

  /**
   * Save the token for logging in
   * @param  {Object} event ipc event object
   * @param  {String} token token entered by the user
   */
  saveToken(event, token) {
    let callback = err => {
      this.login();
      if (this.tokenWindow) this.tokenWindow.close();
    };

    this.config.findOne({}, (err, doc) => {
      if (!doc) {
        app.config = {token};
        this.config.insert({token}, callback);
      } else {
        doc.token = token;
        app.config = doc;
        this.config.update({ _id: doc._id }, doc, callback);
      }
    });
  }

  /**
   * Create the token window
   */
  createTokenWindow() {
    this.tokenWindow = new BrowserWindow({width: 650, height: 100});
    this.tokenWindow.loadURL('file://' + __dirname + '/token.html');

    Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu));

    // Register the event listener to save token
    ipcMain.on('token', this.saveToken.bind(this));
  }

  /**
   * Create the client window
   */
  createWindow() {
    this.mainWindow = new BrowserWindow({width: 1280, height: 720});
    this.mainWindow.loadURL('file://' + __dirname + '/index.html');

    // Open the DevTools.
    // this.mainWindow.webContents.openDevTools();

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // create the client menu
    Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu));

    app.mainWindow = this.mainWindow;
  }
}

module.exports = bot => {
  main = new Main(bot);
  return main;
};
