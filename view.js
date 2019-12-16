const { ipcRenderer } = require('electron');

ipcRenderer.on('update-metadata', function(event, metadata) {
	//console.log("update metadata");
	let container = document.getElementById("metadataContainer");

	let list = container.appendChild(document.createElement("dl"));
	for (let k in metadata) {
		let dt = document.createElement("dt");
		dt.appendChild(document.createTextNode(k));
		list.appendChild(dt);
		let dd = document.createElement("dd");
		dd.appendChild(document.createTextNode(metadata[k]));
		list.appendChild(dd);
	}

	if (metadata.title && (metadata.title != ""))
		document.title = metadata.title;
});


ipcRenderer.on('update-toc', function(event, toc) {
	//console.log("update toc");
	let container = document.getElementById("tocContainer");

	let list = container.appendChild(document.createElement("ul"));
	for (let section of toc) {
		let li = document.createElement("li");
		li.appendChild(linkOrText(section.title, section.url));
		list.appendChild(li);

		if ((section.subsections) && (section.subsections.length > 0)) {
			let sublist = li.appendChild(document.createElement("ul"));
			for (let subsection of section.subsections) {
				let li2 = document.createElement("li");
				li2.appendChild(linkOrText(subsection.title, subsection.url));
				sublist.appendChild(li2);
			}
		}
	}
});


ipcRenderer.on('update-text', function(event, htmlText) {
	//console.log("update text");
	let container = document.getElementById("textContainer");
	container.innerHTML = htmlText;
});


function linkOrText(text, targetUrl) {
	let elem = null;

	if (targetUrl && (targetUrl != "")) {
		elem = document.createElement('a');  
		let linkText = document.createTextNode(text);
		elem.appendChild(linkText);  
		elem.href = targetUrl;

	} else {
		elem = document.createTextNode(text);
	}

	return elem;
}