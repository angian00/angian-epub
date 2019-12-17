const { app } = require('electron');
const fs = require('fs-extra');


class BookState {
	constructor(bookId) {
		this.data = {};

		if (bookId) {
			this.bookId = bookId;
			this.data.bookId = bookId;
			this.persist();
		}
	}

	getValue(propName) {
		return this.data[propName];
	}

	setValue(propName, propValue) {
		this.data[propName] = propValue;
		this.persist();
	}

	addSortedValue(propName, propValue) {
		let currArr = this.data[propName];
		if (!currArr)
			currArr = [];

		currArr.push(propValue);
		currArr.sort(function(a, b) {
			return a.index - b.index;
		});

		this.data[propName] = currArr;

		this.persist();
	}

	persist() {
		this.data["lastModified"] = new Date();

		let dirPath = app.getPath("userData") + "/epubLibrary";
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath);
		}

		let filePath = dirPath + "/" + this.bookId + ".json";
		fs.writeFileSync(filePath, JSON.stringify(this.data, null, 4));
	}

	static load(bookId) {
		let dirPath = app.getPath("userData") + "/epubLibrary";
		let filePath = dirPath + "/" + bookId + ".json";
		try {
			let rawData = fs.readFileSync(filePath);

			let b = new BookState();
			b.bookId = bookId;		
			b.data = JSON.parse(rawData);

			return b;
		
		} catch (err) {
			//TODO: handle better
			console.log("Error loading book: " + bookId);
			console.log(err);
			return null;
		}
	}
}


function genUuidv4() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}



exports.genUuidv4 = genUuidv4;
exports.BookState = BookState;