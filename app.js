const { app, BrowserWindow, ipcMain, Menu, screen, dialog } = require('electron');

const fs = require('fs-extra');
const path = require('path');
const xml2json = require('xml2json');
const extractZip = require('extract-zip');

const { GlobalState, BookState } = require("./state");
const parser = require("./parser");


//------ constants ------
//const showDevTools = true;
const showDevTools = false;

const containerPath = "META-INF/container.xml";
const winScaleFactor = 0.8; //percentage of screen size


//------ global variables ------
let win = null;
let globalState = GlobalState.load();
let bookState = null;


//------ event handlers ------
app.on('ready', () => { createWindow(); });
ipcMain.on('update-model-text', (event, section) => { updateModelText(section) });


//------ intra-process callbacks ------
function rootContentReady(bookId, contentBasePath) {
	bookState = BookState.load(bookId);
	if (!bookState) {
		bookState = new BookState(bookId);
	}
	bookState.setValue("contentBasePath", contentBasePath);

	win.webContents.send('update-view-bookmarks', bookState.getValue("bookmarks"));
}

function metadataReady(metadata) {
	win.webContents.send('update-view-metadata', metadata);
}

function tocReady(toc, playOrder) {
	bookState.setValue("toc", toc);
	bookState.setValue("playOrder", playOrder);

	win.webContents.send('update-view-toc', toc);

	updateModelText(null);
}

function sectionReady(section, htmlSrc) {
	bookState.setValue("lastSeenSection", section);
	win.webContents.send('update-view-text', section.url, htmlSrc);
}

let epubCallbacks = { rootContentReady, metadataReady, tocReady };


//------ UI functions ------

function createWindow() {
	createMenu();

	const screenRect = screen.getPrimaryDisplay().bounds;

	win = new BrowserWindow({
		width: winScaleFactor * screenRect.width,
		height: winScaleFactor * screenRect.height,
		webPreferences: {
			nodeIntegration: true
		}
	});

	win.loadFile('index.html');
	if (showDevTools)
		win.webContents.openDevTools();

	win.webContents.on('did-finish-load', function() {
		let lastSeenBook = globalState.getValue("lastSeenBook");
		if (lastSeenBook)
			parser.parseEpub(lastSeenBook, epubCallbacks);
	});
}


function createMenu() {
	let menu = Menu.buildFromTemplate([
		{
			label: 'File',
			submenu: [
				{ label: 'Open File...', accelerator: 'Ctrl+O', 
					click() { 
						dialog.showOpenDialog({
							title: "Choose an .epub file to open",
							defaultPath: ".",
							properties: ['openFile'],
							filters: [
								{ name: 'epubs', extensions: ['epub'] },
								{ name: 'All Files', extensions: ['*'] }
							],
						}).then(result => {
							if ((!result.canceled) && (result.filePaths.length > 0)) {
								loadEpub(result.filePaths[0], (bookId) => { 
									parser.parseEpub(bookId, epubCallbacks);
								});
							}
						});
					}
				},

				{ type:  'separator' },

				{ label: 'Quit', accelerator: 'Ctrl+Q', click() { app.quit() } }
			]
		},
		{
			label: 'View',
			submenu: [
				{ label: 'Toggle Metadata View', accelerator: 'Ctrl+M',
					click() { toggleMetadata(); }
				},
				{ label: 'Toggle Bookmarks View', accelerator: 'Ctrl+B',
					click() { toggleBookmarks(); }
				},
				{ label: 'Toggle Table of Contents', accelerator: 'Ctrl+T',
					click() { toggleToc(); }
				},
				{ label: 'Save Bookmark', accelerator: 'Ctrl+D',
					click() { saveBookmark(); }
				},
				{ label: 'Next Section', accelerator: 'Ctrl+PageDown',
					click() { gotoDelta(+1); }
				},
				{ label: 'Previous Section', accelerator: 'Ctrl+PageUp',
					click() { gotoDelta(-1); }
				},
			]
		}
	]);

	Menu.setApplicationMenu(menu);
}


//------ actions ------
function loadEpub(srcPath, callback) {
	let tmpName = "tmp";
	let cacheDirTmp = app.getPath("userData") + "/epubCache/" + tmpName;

	console.log("loading epub from: " + srcPath + " to cacheDir: " + cacheDirTmp);

	extractZip(srcPath, {dir: cacheDirTmp}, function (err) {
		if (err) {
			//TODO: manage unzip errors
			console.log(err);
		} else {
			let bookId = parser.getBookId(cacheDirTmp);
			
			cacheDirNew = app.getPath("userData") + "/epubCache/" + bookId;
			try {
				if (fs.existsSync(cacheDirNew)) {
					//TODO: check cacheDirNew for integrity
					fs.removeSync(cacheDirTmp);

				} else {
					fs.renameSync(cacheDirTmp, cacheDirNew);
				}

				globalState.setValue("lastSeenBook", bookId);

				callback(bookId);

			} catch (err) {
				//TODO: manage rename errors
				console.log(err);
			}
		}
	});
}

function toggleMetadata() {
	win.webContents.send('toggle-view-metadata');
}

function toggleBookmarks() {
	win.webContents.send('toggle-view-bookmarks');
}

function toggleToc() {
	win.webContents.send('toggle-view-toc');
}


function saveBookmark() {
	let newBM = bookState.getValue("lastSeenSection");

	bookState.addSortedValue("bookmarks", newBM);
	win.webContents.send('update-view-bookmarks', bookState.getValue("bookmarks"));
}

function gotoDelta(delta) {
	let lastSeen = bookState.getValue("lastSeenSection");
	let playOrder = bookState.getValue("playOrder");

	let nextIndex = lastSeen.index + delta;
	let nextUrl = playOrder[nextIndex];
	if (nextUrl)
		updateModelText({ index: nextIndex, url: nextUrl });
	else
		console.log("Reached the beginning/end of the book");
}


function updateModelText(section) {
	if (!section) {
		if (bookState.getValue("lastSeenSection"))
			section = bookState.getValue("lastSeenSection");
		else
			section = {index: 1, url: bookState.getValue("playOrder")[1]};
	}

	parser.parseText(bookState.getValue("contentBasePath") + "/"  + section.url, section, sectionReady);
}


