const showDevTools = false;


const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');

const fs = require('fs-extra');
const path = require('path');
const xml2json = require('xml2json');
const extractZip = require('extract-zip');
const jsdom = require("jsdom");

const { BookState, genUuidv4 } = require("./util");

const containerPath = "META-INF/container.xml";


let win = null;
let bookState = null;

function createWindow() {
	win = new BrowserWindow({
		width: 1200,
		height: 900,
		webPreferences: {
			nodeIntegration: true
		}
	});

	win.loadFile('index.html');
	if (showDevTools)
		win.webContents.openDevTools();

	setupMenu(win);
}

app.on('ready', createWindow);


function updateModelText(textPath) {
	if (!textPath) {
		textPath = bookState.getValue("lastSeenSection");
	}

	if (!textPath)
		textPath = bookState.getValue("playOrder")[1];

	parseText(bookState.getValue("contentBasePath") + "/"  + textPath, (text) => {
		bookState.setValue("lastSeenSection", textPath);
		win.webContents.send('update-view-text', text);
	});
}

ipcMain.on('update-model-text', (event, textPath) => { updateModelText(textPath) });



function setupMenu(win) {
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
								loadEpub(result.filePaths[0], (epubDir) => { parseEpub(epubDir) });
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
				{ label: 'Save Bookmark', accelerator: 'Ctrl+D',
					click() { saveBookmark(); }
				},
			]
		}
	]);

	Menu.setApplicationMenu(menu);
}


function loadEpub(epubPath, callback) {

	let tmpName = "tmp";
	let cacheDirTmp = app.getPath("userData") + "/epubCache/" + tmpName;

	console.log("loading epub: " + epubPath + " to cacheDir: " + cacheDirTmp);

	extractZip(epubPath, {dir: cacheDirTmp}, function (err) {
		if (err) {
			//TODO: manage unzip errors
			console.log(err);
		} else {
			let bookId = getBookId(cacheDirTmp);
			
			cacheDirNew = app.getPath("userData") + "/epubCache/" + bookId;
			try {
				if (fs.existsSync(cacheDirNew)) {
					//TODO: check cacheDirNew for integrity
					fs.removeSync(cacheDirTmp);

				} else {
					fs.renameSync(cacheDirTmp, cacheDirNew);
				}

				bookState = BookState.load(bookId);
				if (!bookState) {
					bookState = new BookState(bookId);
					bookState.setValue("cacheDir", cacheDirNew);
				}

				callback(cacheDirNew);
			} catch (err) {
				//TODO: manage rename errors
				console.log(err);
			}
		}
	});

}


function getBookId(epubDir) {
	try {
		let data = fs.readFileSync(epubDir + "/"  + containerPath);
		let containerJson = xml2json.toJson(data, {object: true});
		let rootfile = containerJson.container.rootfiles.rootfile;
		//TODO: handle gracefully multiple-package case

		let contentPath = rootfile["full-path"];

		data = fs.readFileSync(epubDir + "/" + contentPath);
		let json = xml2json.toJson(data, {object: true});
		let rawMetadata = json.package.metadata;

		if (rawMetadata["dc:identifier"]) {
			//TODO: add robustness
			let bookIdStr = rawMetadata["dc:identifier"]["$t"];
			return bookIdStr.substring(bookIdStr.lastIndexOf(":") + 1);

		} else {
			return genUuidv4();
		}

	} catch (err) {
		//TODO: manage IO err
		console.log(err);
		return null;
	}
}


function parseEpub(epubDir) {
	fs.readFile(epubDir + "/"  + containerPath, function(err, data) {
		let containerJson = xml2json.toJson(data, {object: true});
		let rootfile = containerJson.container.rootfiles.rootfile;

		//TODO: handle gracefully multiple-package case

		let contentPath = rootfile["full-path"];

		fs.readFile(epubDir + "/" + contentPath, function(err, data) {
			let json = xml2json.toJson(data, {object: true});
			//console.log(json);

			parseMetadata(json.package.metadata, (metadata) => {
				win.webContents.send('update-view-metadata', metadata);
			});
			
			let epubItems = {};
			for (let item of json.package.manifest.item) {
				//href, id, media-type
				epubItems[item.id] = item;
			}

			let tocId = json.package.spine.toc;

			//TODO: handle absolute and relative paths as well
			let contentBasePath = path.dirname(epubDir + "/" + contentPath);
			bookState.setValue("contentBasePath", contentBasePath);

			let tocFullPath = contentBasePath + "/"  + epubItems[tocId].href;
			parseToc(tocFullPath, (toc, playOrder) => {
				bookState.setValue("toc", toc);
				bookState.setValue("playOrder", playOrder);

				win.webContents.send('update-view-toc', toc);
			});
		});
	});
}


function parseMetadata(origMetadata, callback) {
	let parsedMetadata = {};

	for (let tag in origMetadata) {
		if (tag.startsWith("xmlns") || tag.startsWith("meta"))
			continue;

		let value = origMetadata[tag];

		if (tag.startsWith("dc:"))
			tag = tag.substring(3,);

		if (tag == "date") {
			for (let subItem of value) {
				let tagNew = tag + "_" + subItem["opf:event"];
				let valueNew = subItem["$t"];
				parsedMetadata[tagNew] = valueNew;
			}

		} else if (typeof value == "object") {
			value = value["$t"];
			parsedMetadata[tag] = value;

		} else {
			parsedMetadata[tag] = value;
		}
	}

	callback(parsedMetadata);
}


function parseToc(tocFile, callback) {
	fs.readFile(tocFile, function(err, data) {
		let parsedToc = [];
		let playOrder = {};

		let json = xml2json.toJson(data, {object: true});
		let navMap = json.ncx.navMap;

		for (let navPoint of navMap.navPoint) {
			if (navPoint.playOrder)
				playOrder[navPoint.playOrder] = navPoint.content.src;

			section = {
				title: navPoint.navLabel.text, 
				url: navPoint.content.src, 
				subsections: [],
			};

			let subItems = navPoint.navPoint;
			if (!subItems)
				subItems = [];

			else if (!Array.isArray(subItems))
				subItems = [subItems];

			//TODO: support n-level nesting through recursion
			for (let navPoint2 of subItems) {
				if (navPoint2.playOrder)
					playOrder[navPoint2.playOrder] = navPoint2.content.src;

				section.subsections.push({
					title: navPoint2.navLabel.text, 
					url: navPoint2.content.src,
					subsections: [],
				});
			}

			parsedToc.push(section);
		}

		let parsedOrder = {};
		for (let indexStr in playOrder) {
			parsedOrder[parseInt(indexStr)] = playOrder[indexStr];
		}

		callback(parsedToc, parsedOrder);
	});
}


function parseText(textFile, callback) {
	fs.readFile(textFile, function(err, data) {
		//console.log("parseText: " + textFile);
		const xmlDoc = new jsdom.JSDOM(data.toString());

		let htmlText = xmlDoc.window.document.querySelector("body").innerHTML;

		callback(htmlText);
	});
}


function saveBookmark() {
	bookState.appendValue("bookmarks", bookState.getValue("lastSeenSection"));
}
