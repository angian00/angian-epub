const { app, BrowserWindow, Menu, dialog } = require('electron');

const fs = require('fs-extra');
const path = require('path');
const xml2json = require('xml2json');
const extractZip = require('extract-zip');
const jsdom = require("jsdom");


const containerPath = "META-INF/container.xml";


function createWindow() {
	let win = new BrowserWindow({
		width: 1200,
		height: 900,
		webPreferences: {
			nodeIntegration: true
		}
	});

	win.loadFile('index.html');
	win.webContents.openDevTools();

	setupMenu(win);
}

app.on('ready', createWindow);


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
								loadEpub(result.filePaths[0], (epubDir) => { parseEpub(epubDir, win) });
							}
						});
					}
				},

				{ type:  'separator' },

				{ label: 'Quit', accelerator: 'Ctrl+Q', click() { app.quit() } }
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
			//TODO: get epubName from metadata
			let epubName = "testUnzip";
			
			cacheDirNew = app.getPath("userData") + "/epubCache/" + epubName;
			try {
				if (fs.existsSync(cacheDirNew))
					fs.removeSync(cacheDirNew);
				fs.renameSync(cacheDirTmp, cacheDirNew);
				callback(cacheDirNew);
			} catch (err) {
				//TODO: manage rename errors
				console.log(err);
			}
		}
	});

}


function parseEpub(epubDir, win) {
	fs.readFile(epubDir + "/"  + containerPath, function(err, data) {
		let containerJson = xml2json.toJson(data, {object: true});
		let rootfile = containerJson.container.rootfiles.rootfile;

		//TODO: handle gracefully multiple-package case

		let contentPath = rootfile["full-path"];

		fs.readFile(epubDir + "/" + contentPath, function(err, data) {
			let json = xml2json.toJson(data, {object: true});
			//console.log(json);

			parseMetadata(json.package.metadata, (metadata) => {
				win.webContents.send('update-metadata', metadata);
			});
			
			let epubItems = {};
			for (let item of json.package.manifest.item) {
				//console.log(item);
				//href, id, media-type
				epubItems[item.id] = item;
			}

			let tocId = json.package.spine.toc;

			//TODO: handle absolute and relative paths as well
			let contentBasePath = path.dirname(epubDir + "/" + contentPath);
			let tocFullPath = contentBasePath + "/"  + epubItems[tocId].href;
			parseToc(tocFullPath, (toc, playOrder) => {
				win.webContents.send('update-toc', toc);

				let textPath = playOrder[1];
				parseText(contentBasePath + "/"  + textPath, 
					(text) => { win.webContents.send('update-text', text); });

			});

			//console.log(json.package.spine);
			//json.package.guide;
	
		});
	});
}


function parseMetadata(origMetadata, callback) {
	let parsedMetadata = {};

	for (let tag in origMetadata) {
		if (tag.startsWith("xmlns") || tag.startsWith("meta"))
			continue;

		let value = origMetadata[tag];
		//console.log("tag: " + tag + "; value type: " + (typeof value));

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
		console.log(json);
		let navMap = json.ncx.navMap;

		for (let navPoint of navMap.navPoint) {
			//console.log("\t" + navPoint.navLabel.text);
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

				//console.log("\t\t" + navPoint2.navLabel.text);
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
		console.log("----------raw text:");
		console.log(data.toString());

		const xmlDoc = new jsdom.JSDOM(data.toString());

		let htmlText = xmlDoc.window.document.querySelector("body").innerHTML;
		console.log("----------htmlText: ");
		console.log(htmlText);
		
		callback(htmlText);
	});
}


/*
function parseText(htmlFile, callback) {
	jsdom.JSDOM.fromFile(htmlFile).then((xmlDoc) => {
		let htmlText = xmlDoc.window.document.querySelector("body").innerHTML;
		console.log(htmlText);

		callback(htmlText);
	});
}
*/