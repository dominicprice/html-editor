/* editor.js - HTML Editor
 * Distributed under MIT licence, 
 * see licence file 
 */

/********************
 * Global variables *
 ********************/
 
var editor = null; // The CodeMirror instance
var preview = null; // The IFrame instance


/********************
 * Editor utilities *
 ********************/
 
/// Return the editor options object cached in localStorage,
/// or return a new instance containing the set of default
/// options if no saved version exists
function getSavedOptions(use_defaults) {
	let options = localStorage.getItem("editor-options");
	if (!options) {
		return {
			mode:  "htmlmixed",
			indentUnit: 4,
			lineNumbers: true,
			matchTags: {bothTags: true},
			extraKeys: {
				"Ctrl-N": onFileNew.bind(this, false),
				"Ctrl-O": document.getElementById("file-open").click,
				"Ctrl-S": onFileSave,
				"Ctrl-Q": onFileClose,
				"Ctrl-J": "toMatchingTag",
				"Ctrl-.": "closeTag"
			},
			theme: "default",
			lineWrapping: false,
			lineNumbers: true,
			indentUnit: 2,
			tabSize: 4,
			smartIndent: false,
			autoCloseTags: false,
			indentWithTabs: true
		};		
	}
	else {
		return JSON.parse(options);
	}
}

/// Set an option in the editor instance and also
/// save it to localStorage
function setOptionAndCache(opt, val) {
	editor.setOption(opt, val);
	let options = getSavedOptions(false);
	options[opt] = val;
	localStorage.setItem("editor-options", JSON.stringify(options));
}

/// Callback to resize the editor to fit the parent div
function editorOnResizeEvent() {
	let editor_parent = document.getElementById("editor-parent");
	let bounding_box = editor_parent.getBoundingClientRect();
	editor.setSize(bounding_box.width, bounding_box.height);
}

/// Retrieve the text between <title>...</title> tags in the editor
function editorGetTitle() {
	let title = editor.getValue().match(/<title>(.*?)<\/title>/);
	if (title && title[1] !== "") 
		return title[1];
	else
		return "Untitled Webpage";
}

/// Callback to update the preview window with the rendered contents
/// of the editor
function editorOnChange() {
	document.getElementById("page-title").innerHTML = "Currently editing \"" + editorGetTitle() + "\"";
	preview.srcdoc = editor.getValue();
	localStorage.setItem("editor-value", editor.getValue())
}


/********************
 *  Menu callbacks  *
 ********************/
 
function onFileNew(force) {
	if (force || window.confirm("Delete current changes and start a new session?")) {
		editor.setValue("<!DOCTYPE html>\n<html>\n\t<head>\n\t\t<title></title>\n\t\t" + 
						"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">" + 
						"\n\t</head>\n\t<body>\n\t</body>\n</html>");
	}
}

function onFileOpen() {
	let files = document.getElementById("file-open").files;
	if (files.length < 1)
		return;
	
	let reader = new FileReader();
	reader.addEventListener("loadend", function (e) {
		try {
			editor.setValue(reader.result);
		}
		catch (err) {
			window.alert("Could not load file " + files[0].name + ":\n" + err);
		}
	});
	reader.readAsText(files[0]);
}

function onFileSave() {
	let file = new Blob([editor.getValue()], {type: "html"});
	let a = document.createElement("a");
	let url = URL.createObjectURL(file);
	a.href = url;
	a.download = editorGetTitle() + ".html"
	document.body.appendChild(a);
	a.click();
	setTimeout(function() {
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	}, 0);
}

function onFileClose() {
	window.close();
}

function onOptionsResetToDefault() {
	editor.openDialog("Reset all options to default (y/N)? <input type=\"text\" maxlength=\"1\" />", function (sure) {
		if (sure == "y" || sure == "Y") {
			editor.openNotification("Effect will take place on editor restart.");
			localStorage.removeItem("editor-options");
		}
	});
}


/********************
 *  Initialization  *
 ********************/

/// Master initialization, called once
function initEditor() {
	// Preview window
	let preview_parent = document.getElementById("preview-parent");	
	preview = document.createElement("iframe");
	preview.style = "width: 100%; height: 100%; border: none;";
	preview_parent.appendChild(preview);

	// CodeMirror instance
	let editor_parent = document.getElementById("editor-parent");
	editor = CodeMirror(editor_parent, getSavedOptions(false));
	editor.on("change", editorOnChange);
	window.addEventListener("onresize", editorOnResizeEvent);
	editor.refresh();
	if (localStorage.getItem("editor-value") !== null)
		editor.setValue(localStorage.getItem("editor-value"));
	else
		onFileNew(true);
	editorOnResizeEvent();
	editorOnChange();
	
	initMenuCallbacks();
	
	Split([editor_parent, preview_parent], {
		onDrag: editorOnResizeEvent,
		gutterSize: 3
	});
}

/// Add functionality to the menu buttons
function initMenuCallbacks() {
	let bindToCallback = function (id, evnt, callback) {
		document.getElementById(id).addEventListener(evnt, callback);
	}
	let bindToCommand = function (id, cmd) {
		bindToCallback(id, "click", editor.execCommand.bind(editor, cmd));
	}
	let bindCheckboxToOption = function(id, opt) {
		let elem = document.getElementById(id);
		if (editor.getOption(opt))
			elem.checked = true;
		elem.addEventListener("change", function () {
			setOptionAndCache(opt, elem.checked);
		});
	}

	bindToCallback("file-new", "click", onFileNew.bind(this, false));
	bindToCallback("file-open", "change", onFileOpen.bind(this.files)); 
	bindToCallback("file-save", "click", onFileSave);
	bindToCallback("file-close", "click", onFileClose);

	bindToCommand("edit-undo", "undo");
	bindToCommand("edit-redo", "redo");
	bindToCommand("edit-selectall", "selectAll");
	bindToCommand("edit-deleteline", "deleteLine");
	bindToCommand("edit-indent", "indentMore");
	bindToCommand("edit-dedent", "indentLess");
	bindToCommand("edit-autoindent", "indentAuto");
	bindToCommand("edit-closetag", "closeTag");
	
	bindToCommand("search-find", "find");
	bindToCommand("search-findnext", "findNext");
	bindToCommand("search-findprev", "findPrev");
	bindToCommand("search-replace", "replace");
	bindToCommand("search-replaceall", "replaceAll");
	bindToCommand("search-jumptoline", "jumpToLine");
	bindToCommand("search-tomatchingtag", "toMatchingTag");
	
	bindCheckboxToOption("view-linewrapping", "lineWrapping");
	bindCheckboxToOption("view-linenumbers", "lineNumbers");
	
	let current_theme = editor.getOption("theme");
	let theme_labels = document.getElementsByClassName("theme-selector");
	for (let i = 0; i < theme_labels.length; ++i) {
		if (theme_labels.item(i).innerHTML === current_theme)
			theme_labels.item(i).classList.add("active");
		theme_labels.item(i).addEventListener("click", function () {
			let themes = document.getElementsByClassName("theme-selector");
			for (let j = 0; j < themes.length; ++j)
				themes.item(j).classList.remove("active");
			setOptionAndCache("theme", this.innerHTML);
			this.classList.add("active");
		});
	}
	
	bindToCallback("options-indentunit", "click", function () {
		let curval = editor.getOption("indentUnit");
		editor.openDialog("Enter a value for indent unit: <input type='number' value=\"" + curval + "\" min=1 />", setOptionAndCache.bind(this, "indentUnit"));
	});
	bindToCallback("options-tabsize", "click", function () {
		let curval = editor.getOption("tabSize");
		editor.openDialog("Enter a value for tab size: <input type='number' value=\"" + curval + "\" min=1 />", setOptionAndCache.bind(this, "tabSize"));
	});
	bindCheckboxToOption("options-smartindent", "smartIndent");
	bindCheckboxToOption("options-indentwithtabs", "indentWithTabs");
	bindCheckboxToOption("options-autoclosetags", "autoCloseTags");
	bindToCallback("options-resettodefault", "click", onOptionsResetToDefault);
}
