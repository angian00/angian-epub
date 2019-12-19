const { app } = require('electron');

const fs = require('fs-extra');
const path = require('path');
const xml2json = require('xml2json');
const jsdom = require("jsdom");
const { genUuidv4 } = require("./util");


const containerPath = "META-INF/container.xml";  //FIXME: duplicate function


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


function parseEpub(bookId, callbacks) {
	let epubDir = app.getPath("userData") + "/epubCache/" + bookId;
	
	fs.readFile(epubDir + "/"  + containerPath, function(err, data) {
		let containerJson = xml2json.toJson(data, {object: true});
		let rootfile = containerJson.container.rootfiles.rootfile;

		//TODO: handle gracefully multiple-package case

		let contentPath = rootfile["full-path"];
		//TODO: handle absolute and relative paths as well
		let contentBasePath = path.dirname(epubDir + "/" + contentPath);
		if (callbacks.rootContentReady) {
			callbacks.rootContentReady(bookId, contentBasePath);
		}

		fs.readFile(epubDir + "/" + contentPath, function(err, data) {
			let json = xml2json.toJson(data, {object: true});
			//console.log(json);

			parseMetadata(json.package.metadata, callbacks.metadataReady);
			
			let epubItems = {};
			for (let item of json.package.manifest.item) {
				//href, id, media-type
				epubItems[item.id] = item;
			}

			let tocId = json.package.spine.toc;

			let tocFullPath = contentBasePath + "/"  + epubItems[tocId].href;
			parseToc(tocFullPath, callbacks.tocReady);
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

	if (callback)
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
				index: parseInt(navPoint.playOrder),
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
					index: parseInt(navPoint2.playOrder),
					subsections: [],
				});
			}

			parsedToc.push(section);
		}

		let parsedOrder = {};
		for (let indexStr in playOrder) {
			parsedOrder[parseInt(indexStr)] = playOrder[indexStr];
		}

		if (callback)
			callback(parsedToc, parsedOrder);
	});
}


function parseText(textFile, section, callback) {
	fs.readFile(textFile, function(err, data) {
		//console.log("parseText: " + textFile);
		const xmlDoc = new jsdom.JSDOM(data.toString());

		let htmlText = xmlDoc.window.document.querySelector("body").innerHTML;

		callback(section, htmlText);
	});
}


exports.parseEpub = parseEpub;
exports.getBookId = getBookId;
exports.parseMetadata = parseMetadata;
exports.parseToc = parseToc;
exports.parseText = parseText;
