const { app, BrowserWindow, Menu, dialog } = require('electron');

const fs = require('fs');
const xml2json = require('xml2json');
const extractZip = require('extract-zip');


const contentPath = 'OEBPS/content.opf';
const tocPath = 'OEBPS/toc.ncx';
const textPath = 'OEBPS/Text/Section0049.htm';


function createWindow() {
	let win = new BrowserWindow({
		width: 1200,
		height: 900,
		webPreferences: {
			nodeIntegration: true
		}
	});

	win.loadFile('index.html');
	//win.webContents.openDevTools();

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

	//let tmpName = "testUnzip";
	let epubName = "testUnzip";
	let cacheDir = app.getPath("userData") + "/epubCache/" + epubName;

	console.log("loading epub: " + epubPath + " to cacheDir: " + cacheDir);

	extractZip(epubPath, {dir: cacheDir}, function (err) {
		if (err) {
			//TODO: manage unzip errors
			console.log(err);
		} else {
			callback(cacheDir);
		}
	});

	//TODO: get epub metadata and rename cache dir accordingly
}

function parseEpub(epubDir, win) {
	parseMetadata(epubDir + "/"  + contentPath, 
		(metadata) => { win.webContents.send('update-metadata', metadata); });
	
	parseToc(epubDir + "/"  + tocPath, 
		(toc) => { win.webContents.send('update-toc', toc); });
	
	parseText(epubDir + "/"  + textPath, 
		(text) => { win.webContents.send('update-text', text); });
}

function parseMetadata(contentFile, callback) {
	fs.readFile(contentFile, function(err, data) {
		let parsedMetadata = {};

		let json = xml2json.toJson(data, {object: true});
		let origMetadata = json.package.metadata;

		for (let tag in origMetadata) {
			if (tag.startsWith("xmlns") || tag.startsWith("meta"))
				continue;

			let value = origMetadata[tag];
			//console.log("tag: " + tag + "; value type: " + (typeof value));

			if (tag.startsWith("dc:"))
				tag = tag.substring(3,);

			if (tag == "dc:date") {
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
	});
}


function parseToc(tocFile, callback) {
	fs.readFile(tocFile, function(err, data) {
		let parsedToc = [];

		let json = xml2json.toJson(data, {object: true});
		let navMap = json.ncx.navMap;

		for (let navPoint of navMap.navPoint) {
			//console.log("\t" + navPoint.navLabel.text);

			section = {title: navPoint.navLabel.text, url: navPoint.content.src, subsections: []};
			let subItems = navPoint.navPoint;
			if (!subItems)
				subItems = [];

			else if (!Array.isArray(subItems))
				subItems = [subItems];

			for (let navPoint2 of subItems) {
				//console.log("\t\t" + navPoint2.navLabel.text);
				section.subsections.push({title: navPoint2.navLabel.text, url: navPoint2.content.src, subsections: []});
			}

			parsedToc.push(section);
		}

		callback(parsedToc);
	});
}


function parseText(textFile, callback) {
	fs.readFile(textFile, function(err, data) {
		const jsdom = require("jsdom");
		const xmlDoc = new jsdom.JSDOM(data);

		let htmlText = xmlDoc.window.document.querySelector("body").innerHTML;
		
		callback(htmlText);
	});
}
