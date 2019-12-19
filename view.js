const { ipcRenderer } = require('electron');
const { listFromSet } = require("./util");


ipcRenderer.on('update-view-metadata', function(event, metadata) {
	//console.log("update-view-metadata");
	let container = document.getElementById("metadataContainer");
	//remove children
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}

	for (let k in metadata) {
		let d = document.createElement("div");
		container.appendChild(d);

		let s1 = document.createElement("span");
		s1.appendChild(document.createTextNode(k));
		d.appendChild(s1);
		let s2 = document.createElement("span");
		s2.appendChild(document.createTextNode(metadata[k]));
		d.appendChild(s2);
		
		container.appendChild(d);
	}

	if (metadata.title && (metadata.title != ""))
		document.title = metadata.title;
});

ipcRenderer.on('update-view-bookmarks', function(event, bookmarks) {
	//console.log("update-view-bookmarks");
	let container = document.getElementById("bookmarkContainer");
	//remove children
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}

	if (bookmarks.length > 0) {
		let list = container.appendChild(document.createElement("ul"));
		for (let b of bookmarks) {
			let li = document.createElement("li");
			let aLabel = "Section #" + b.index; //TODO: improve bookmark labels
			li.appendChild(linkOrText(aLabel, {index: b.index, url: b.url}));
			list.appendChild(li);
		}
	}
});


ipcRenderer.on('update-view-toc', function(event, toc) {
	//console.log("update toc");
	let container = document.getElementById("tocContainer");

	let list = container.appendChild(document.createElement("ul"));
	for (let section of toc) {
		let li = document.createElement("li");
		li.appendChild(linkOrText(section.title, {index: section.index, url: section.url}));
		list.appendChild(li);

		if ((section.subsections) && (section.subsections.length > 0)) {
			let sublist = li.appendChild(document.createElement("ul"));
			for (let subsection of section.subsections) {
				let li2 = document.createElement("li");
				li2.appendChild(linkOrText(subsection.title, {index: subsection.index, url: subsection.url}));
				sublist.appendChild(li2);
			}
		}
	}
});


ipcRenderer.on('update-view-text', function(event, sectionUrl, htmlText) {
	//console.log("update-view-text");

	let container = document.getElementById("textContainer");
	container.innerHTML = htmlText;

	let tocItems = document.getElementById("tocContainer").getElementsByTagName("a");
	
	for (let tocItem of tocItems) {
		//console.log(tocItem.classList);
		//console.log(tocItem.href); //file:///home/angian/git_workspace/angian-epub/Text/Section00xx.htm
		//TODO: normalize urls to make more robust
		if (tocItem.href.endsWith(sectionUrl)) {
			tocItem.classList.add("current");
		} else {
			tocItem.classList.remove("current");
		}
	}
});


ipcRenderer.on('toggle-view-metadata', function(event) {
	let container = document.getElementById("metadataContainer");
	container.classList.toggle("hidden");
});

ipcRenderer.on('toggle-view-bookmarks', function(event) {
	let container = document.getElementById("bookmarkContainer");
	container.classList.toggle("hidden");
});

ipcRenderer.on('toggle-view-toc', function(event) {
	let container = document.getElementById("tocContainer");
	container.classList.toggle("hidden");
});


function linkOrText(text, section) {
	let elem = null;

	if (section) {
		elem = document.createElement('a');  
		let linkText = document.createTextNode(text);
		elem.appendChild(linkText);
		elem.href = section.url;
		elem.onclick = () => {
			ipcRenderer.send('update-model-text', section);
			return false;
		};

	} else {
		elem = document.createTextNode(text);
	}

	return elem;
}

