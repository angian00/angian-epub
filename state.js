const { app } = require('electron');
const fs = require('fs-extra');
const path = require('path');


class _State {
	constructor() {
		this.data = {};
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

		if (!currArr.includes(propValue))
			currArr.push(propValue);
		
		currArr.sort(function(a, b) {
			return a.index - b.index;
		});

		this.data[propName] = currArr;

		this.persist();
	}

	persist() {
		this.data["lastModified"] = new Date();

		let persistPath = this.getPersistPath();
		let dirPath = path.dirname(persistPath);
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath);
		}

		fs.writeFileSync(persistPath, JSON.stringify(this.data, null, 4));
	}


	loadData() {
		let rawData = fs.readFileSync(this.getPersistPath());
		this.data = JSON.parse(rawData);
	}

}


class GlobalState extends _State {
	getPersistPath() {
		return app.getPath("userData") + "/epubLibrary" + "/_global.json";
	}

	static load() {
		let gs = new GlobalState();
		try {
			gs.loadData();

		} catch (err) {
			console.log("Error loading GlobalState");
			console.log(err);
		}

		return gs;		
	}
}



class BookState extends _State {
	constructor(bookId) {
		super();

		if (bookId) {
			this.bookId = bookId;
			this.data.bookId = bookId;
			this.persist();
		}
	}

	getPersistPath() {
		return app.getPath("userData") + "/epubLibrary" + this.bookId + ".json";
	}

	static load(bookId) {
		try {
			let b = new BookState();
			b.bookId = bookId;		
			b.loadData();

			return b;
		
		} catch (err) {
			//TODO: handle better
			console.log("Error loading book state for: " + bookId);
			//console.log(err);
			return null;
		}
	}
}


exports.GlobalState = GlobalState;
exports.BookState = BookState;
