/**********************************
* editor.js - HTML Editor         *
* Distributed under MIT licence,  *
* see licence file                *
**********************************/


/**********************
* Global vars         * 
**********************/

// Debug control
let DEBUG = true;
let cl = DEBUG ? console.log : function () {};
 
// The two main editor and preview elements
let editor = null;
let preview = null;
let pconsole = null;

// Tab elements
let tabs = [];
let tabActive = null;
let tabPreview = null;


/**********************
* Global cache        * 
**********************/

function setCache(key, value)
{
	if (value === null)
		localStorage.removeItem(key)
	else
		localStorage.setItem(key, JSON.stringify(value));
}

function setCacheIfEmpty(key, value)
{
	if (localStorage.getItem(key) === null)
		setCache(key, value);
}

function hasCache(key) {
	return localStorage.getItem(key) !== null;
}

function getCache(key)
{
	let value = localStorage.getItem(key);
	return JSON.parse(value);
}

function getCacheOrDefault(key, defaultValue)
{
	let value = getCache(key);
	return value === null ? defaultValue : value;
}

function getCacheKeys(prefix)
{
	let keys = []
	for (let i = 0; i < localStorage.length; ++i) {
		let curKey = localStorage.key(i);
		if (curKey.startsWith(prefix)) {
			curKey = curKey.substr(prefix.length + 1);
			let pos = curKey.indexOf(":");
			if (pos >= 0)
				curKey = curKey.substr(0, pos);
			if (keys.indexOf(curKey) === -1)
				keys.push(curKey);
		}
	}
	return keys;
}

function removeCache(key)
{
	localStorage.removeItem(key);
}


/*******************
* Editor utilities *
*******************/

var editorDefaultOptions = {
	indentUnit: 4,
	tabSize: 4,
	matchTags: {bothTags: true},
	extraKeys: {
		"Ctrl-T": document.getElementById("file-new").click,
		"Ctrl-O": document.getElementById("file-open").click,
		"Ctrl-D": document.getElementById("file-download").click,
		"Ctrl-Q": document.getElementById("file-close").click,
		"Ctrl-J": "toMatchingTag",
		"Ctrl-.": "closeTag"
	},
	theme: "default",
	lineWrapping: false,
	lineNumbers: true,
	smartIndent: false,
	autoCloseTags: false,
	indentWithTabs: true,
	fontSize: 10
};

/// Callback to resize the editor to fit the parent div
function editorOnResizeEvent() {
	let bounding_box = editor.getWrapperElement().parentNode.getBoundingClientRect();
	editor.setSize(bounding_box.width, bounding_box.height - 35);
}

function previewOnError(msg, src, lineno, colno, err) {
	if (src === "about:srcdoc")
		src = tabPreview.name;
	else {
		for (const tab of tabs) {
			if (src === tab.url) {
				src = tab.name;
				break;
			}
		}
	}
	
	pconsole.innerHTML += 
		`<div class="console-error">[${src}:${lineno}:${colno}] ${err.name}: ${msg}</div>`;
	return false;
}

/// Callback to update the preview window with the rendered contents
/// of the editor
function editorOnChange() {
	if (!(tabActive && tabPreview))
		return;
	setCache(`tabs:${tabActive.name}:value`, editor.getValue());
	tabUpdateURL(tabActive);
	let src = getCache(`tabs:${tabPreview.name}:value`);
	if (src === null)
		return;
	for (const tab of tabs) 
		src = src.split(tab.name).join(tab.url);
	preview.srcdoc = src;
	pconsole.innerHTML = "";
	$(preview).ready(function() {
		preview.contentWindow.onerror = previewOnError;
	});
}

/// Set the font size of the editor
function editorSetFontSize(fontSize) {
	editor.getWrapperElement().style.fontSize = fontSize + "pt";
	$("#view-fontsize-display").html(fontSize);
	setCache("options:fontSize", fontSize);
}

/// Return the colour the cursor is currently highlighting in hex form,
/// and the start and end range of the string, or null if no colour is
/// selected
function editorGetSelectedColour() {
	const color_regex = /#(?:[0-9a-f]{2}){2,4}|#[0-9a-f]{3}|(?:rgba?|hsla?)\((?:\d+%?(?:deg|rad|grad|turn)?(?:,|\s)+){2,3}[\s\/]*[\d\.]+%?\)/i;
	let cursor_pos = editor.getCursor();
	let match = editor.getLine(cursor_pos.line).match(color_regex);
	if (match === null || cursor_pos.ch < match.index || cursor_pos.ch > match.index + match[0].length)
		return null;
	return [ w3color(match[0]).toHexString(), cursor_pos.line, match.index, match.index + match[0].length ];
}

function editorYesNo(prompt, callback) {
	editor.openDialog(
		prompt + " <input type=\"text\" maxlength=\"1\" />", 
		function (response) {
			if (response.toLowerCase() == "y")
				callback();
		}
	);
}


/*******************
*  Menu callbacks  *
*******************/
 
function onFileNew() {
	return tabOnNew();
}

function onFileOpen() {
	let files = document.getElementById("file-open").files;
	if (files.length < 1)
		return;
	
	let reader = new FileReader();
	reader.addEventListener("loadend", function (e) {
		try {
			tabCreate(files[0].name, true, false);
			editor.setValue(reader.result);
		}
		catch (err) {
			window.alert("Could not load file " + files[0].name + ":\n" + err);
		}
	});
	reader.readAsText(files[0]);
}

function onFileDownload() {
	let a = document.createElement("a");
	a.href = tabActive.url;
	a.download = tabActive.name;
	document.body.appendChild(a);
	a.click();
	setTimeout(function() {
		document.body.removeChild(a);
	}, 0);
}

function onFileDownloadAll() {
	editor.openDialog(`Enter filename: <input type="text">`, function(name) {
		var zip = new JSZip();
		for (const tab of tabs) 
			zip.file(tab.name, getCache(`tabs:${tab.name}:value`));
		zip.generateAsync({type: "blob"}).then(function(blob) {
			let a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = name;
			document.body.appendChild(a);
			a.click();
			setTimeout(function() { 
				URL.revokeObjectURL(a.href);
				document.body.removeChild(a); 
			}, 0);
		});
	});
}

function onFileClose() {
	window.close();
}

function onViewFontSizeUp() {
	let fontSize = getCache("options:fontSize") + 1;
	editorSetFontSize(fontSize);
}

function onViewFontSizeDown() {
	let fontSize = getCache("options:fontSize") - 1 || 1;
	editorSetFontSize(fontSize);
}

function onViewConsole() {
	if (this.checked)
		$(pconsole).removeClass("hidden")
	else
		$(pconsole).addClass("hidden");
	setCache(`options:viewConsole`, this.checked);
}

function onToolsChooseColourSelect() {
	let cur_colour = editorGetSelectedColour();
	if (cur_colour !== null)
		this.value = cur_colour[0];
}

function onToolsChooseColourInput() {
	let cur_colour = editorGetSelectedColour();
	if (cur_colour === null) {
		editor.replaceRange(this.value, editor.getCursor());
	}
	else {
		editor.replaceRange(this,value, { line: cur_colour[1], ch: cur_colour[2] }, { line: cur_colour[1], ch: cur_colour[3] } );
	}
}

function onToolsChooseColourChange() {
	// stub
}

function onOptionsIndentUnit() {
	let curval = editor.getOption("indentUnit");
	editor.openDialog(
		"Enter a value for indent unit: " + 
		"<input type='number' value=\"" + curval + "\" min=1 />", 
		function (indentUnit) { editor.setOption("indentUnit", indentUnit); }
	);
}

function onOptionsTabSize() {
	let curval = editor.getOption("tabSize");
	editor.openDialog(
		"Enter a value for tab size: " + 
		"<input type='number' value=\"" + curval + "\" min=1 />",
		function (tabSize) { editor.setOption("tabSize", tabSize); }
	);
}

function onOptionsResetToDefault() {
	editorYesNo(
		"Reset all options to default (y/N)?",
		function () {
			editor.openNotification("Effect will take place on editor restart.");
			localStorage.removeItem("options:cm");		
			localStorage.removeItem("options:fontSize");
		}
	);
}


/*********************
*    Tab functions   *
*********************/

function tabGetExt(tabName) {
	return tabName.split(".").pop();
}

function tabGetMimeType(tabName) {
	switch (tabGetExt(tabName)) {
		case "html":
		case "htm":
			return "text/html";
		case "js":
			return "text/javascript";
		case "css":
			return "text/css";
		case "txt":
			return "text/plain";
		default:
			return "";
	}
}

function tabGetEditorMode(tabName) {
	switch (tabGetExt(tabName)) {
		case "html":
		case "htm":
			return "htmlmixed";
		case "js":
			return "javascript";
		case "css":
			return "css";
		default:
			return "";
	}
}

function tabDefaultValue(tabName)
{
	switch (tabGetExt(tabName)) {
		case "html":
		case "htm":
			return "<!DOCTYPE html>\n<html>\n\t<head>\n\t\t<title></title>\n\t\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n\t</head>\n\t<body>\n\t</body>\n</html>";
		case "css":
			return "body {}";
		case "js":
			return "let body = document.getElementsByTagName('body')[0];\nif (body)\n\tbody.innerHTML += 'Hi';";
		default:
			return "\n";
	}
}

function tabValidateName(name) {
	// Check it only contains valid characters
	const reg = /^[^\s][^\\\/\:\*\"\<\>\|]+$/
	if (!reg.test(name)) 
		return null;
	
	// Split name into filename and extension
	let extension = tabGetExt(name);
	let filename = name.substr(0, name.length - extension.length);
	// Ensure filename is unique
	let tabNames = [];
	for (const tab of tabs)
		tabNames.push(tab.name);
	let copyNumber = 0;
	while (++copyNumber) {
		if (tabNames.indexOf(name) === -1)
			return name;
		else 
			name = `${filename} (${copyNumber})${extension}`;
	}
}

function tabCreate(tabName, setActive, setPreview) {
	// Create the tab in cache
	let name = tabValidateName(tabName);
	if (name === null) {
		editor.openNotification(
			"Invalid tab name! Must contains only alphanumeric " + 
			"characters, underscores and hyphens and have the " +
			"extension .html, .htm, .js, .css or .txt"
		);
		return null;
	}

	setCache(`tabs:${name}:value`, tabDefaultValue(name));
	setCache(`tabs:${name}:active`, !!setActive);
	setCache(`tabs:${name}:preview`, !!setPreview);
	
	// Load the new tab from cache
	let newTab = tabLoadFromCache(name);
	tabSaveNames();
	return newTab;
}

function tabLoadFromCache(tabName) {
	// Check keys exist
	if (!(hasCache(`tabs:${tabName}:value`))) {
		cl(tabName,"not incache");
		return null;
	}
	
	let $tab = $(`<div class="tab"><span class="tab-name">${tabName}</span></div>`);
	let $preview = $(`<button class="fas fa-paint-brush"></button>`);
	let $close = $(`<button class="fas fa-window-close"></button>`);
	
	$tab.append($preview);
	$tab.append($close);
	$tab.insertBefore($("#new-tab"));

	let mode = tabGetEditorMode(tabName);

	let tab = {
		"name": tabName,
		"doc": CodeMirror.Doc(getCache(`tabs:${tabName}:value`), mode),
		"$tab": $tab,
	};
	tabUpdateURL(tab);
	tabs.push(tab);
	if (getCache(`tabs:${tabName}:active`))
		tabOnSetActive(tab);
	if (getCache(`tabs:${tabName}:preview`))
		tabOnSetPreview(tab);
	
	$tab.click(function () { tabOnSetActive(tab); });
	$preview.click(function () { tabOnSetPreview(tab); });
	$close.click(function () {tabOnClose(tab); });
	
	return tab;
}

function tabClose(tab) {
	let isActive = (tab == tabActive);
	let isPreview = (tab == tabPreview);

	tab.$tab.remove();
	removeCache(`tabs:${tab.name}:value`);
	removeCache(`tabs:${tab.name}:active`);
	removeCache(`tabs:${tab.name}:preview`);
	for (let i = 0; i < tabs.length; ++i) {
		if (tabs[i] === tab)
			tabs.splice(i, 1);
	}
	// Can't have no tabs, create one if necessary
	if (tabs.length === 0) {
		let newTab = tabCreate("new.html", true, true);
	}
	else {
		if (isActive) {
			tabActive = null;
			tabOnSetActive(tabs[0]);
		}
		if (isPreview) {
			tabPreview = null;
			tabOnSetPreview(tabs[0]);
		}
	}
	tabSaveNames();
}

function tabRename(tab, name) {
	name = tabValidateName(name);
	if (name === null)
		editor.openNotification("Invalid name!");
	
	setCache(`tabs:${name}:active`, getCache(`tabs:${tab.name}:active`));
	removeCache(`tabs:${tab.name}:active`);
	setCache(`tabs:${name}:preview`, getCache(`tabs:${tab.name}:preview`));
	removeCache(`tabs:${tab.name}:preview`);
	setCache(`tabs:${name}:value`, getCache(`tabs:${tab.name}:value`));
	removeCache(`tabs:${tab.name}:value`);
	
	tab.name = name;
	tab.$tab.children(".tab-name").html(name);
	tabSaveNames();
}

function tabSaveNames() {
	let tabNames = [];
	for (const tab of tabs)
		tabNames.push(tab.name);
	setCache(`tabs:names`, tabNames);
}

/*********************
*    Tab callbacks   *
*********************/

function tabOnNew() {
	editor.openDialog("Enter new filename: <input type='text'>", tabCreate);
}

function tabOnSetActive(tab) {
	// Remove active status from currently active tab
	if (tabActive !== null) {
		tabActive.$tab.removeClass("active");
		setCache(`tabs:${tabActive.name}:active`, false);
	}
	// Add active status to selected tab
	tabActive = tab;
	tab.$tab.addClass("active");
	setCache(`tabs:${tab.name}:active`, true);
	// Update the editor & preview
	editor.swapDoc(tab.doc);
	editorOnChange();
	return false;
}

function tabOnSetPreview(tab) {
	//Remove preview status from currently previewed tab
	if (tabPreview !== null) {
		tabPreview.$tab.removeClass("preview");
		setCache(`tabs:${tabPreview.name}:preview`, false);
	}
	// Add preview status to selected tab
	tabPreview = tab;
	tab.$tab.addClass("preview");
	setCache(`tabs:${tab.name}:preview`, true);
	// Update the preview
	editorOnChange();
	return false;
}

function tabOnMoveLeft(tab) {
	let $prev = tab.$tab.prev();
	if ($prev.length === 0)
		return;
	$prev.insertAfter(tab.$tab);

	for (let i = 0; i < tabs.length; ++i) {
		if (tabs[i] === tab) {
			tabs[i] = tabs[i-1]
			tabs[i-1] = tab;
			break;
		}
	}
	
	tabSaveNames();
}

function tabOnMoveRight(tab) {
	let $next = tab.$tab.next();
	if ($next.attr("id") === "new-tab")
		return;
	$next.insertBefore(tab.$tab);
	
	for (let i = 0; i < tabs.length; ++i) {
		if (tabs[i] === tab) {
			tabs[i] = tabs[i+1]
			tabs[i+1] = tab;
			break;
		}
	}
	
	tabSaveNames();
}

function tabOnRename(tab) {
	editor.openDialog(
		`Enter a new name: <input type="text" value="${tab.name}">`,
		function (res) { tabRename(tab, res); }
	);
}

function tabOnClose(tab) {
	editorYesNo(
		"Are you sure you want to close " + tab.name + "?", 
		function () { tabClose(tab); }
	);
}

function tabUpdateURL(tab) {
	let mimeType = tabGetMimeType(tab.name);
	let blob = new Blob([getCache(`tabs:${tab.name}:value`)], {type: mimeType});
	URL.revokeObjectURL(tab.url)
	tab.url = URL.createObjectURL(blob);	
}


/*******************
*  Initialization  *
*******************/

/// Master initialization, called once
function initEditor() {
	let opts = getCache("options:cm") || editorDefaultOptions;
	editor = CodeMirror.fromTextArea(document.getElementById("editor"), opts);
	pconsole = document.getElementById("console");
	preview = document.getElementById("preview");

	editor.setOptionBase = editor.setOption;
	editor.setOption = function(option, value) {
		editor.setOptionBase(option, value);
		let options = getCache("options:cm") || editorDefaultOptions;
		options[option] = value;
		setCache("options:cm", options);
	}

	editor.on("changes", editorOnChange);
	window.addEventListener("onresize", editorOnResizeEvent);
	
	editorOnResizeEvent();
	editor.refresh();
	
	initMenuCallbacks();
	initTabBar();
	
	Split([editor.getWrapperElement().parentNode, preview.parentNode], {
		onDrag: editorOnResizeEvent,
		gutterSize: 3
	});
	
	editorOnChange();
}

/// Add functionality to the menu buttons
function initThemes() {
	let themes = [
		'default', '3024-day', '3024-night', 'abcdef', 'ambiance-mobile', 'ambiance', 
		'ayu-dark', 'ayu-mirage', 'base16-dark', 'base16-light', 'bespin', 'blackboard', 
		'cobalt', 'colorforth', 'darcula', 'dracula', 'duotone-dark', 'duotone-light', 
		'eclipse', 'elegant', 'erlang-dark', 'gruvbox-dark', 'hopscotch', 'icecoder', 
		'idea', 'isotope', 'lesser-dark', 'liquibyte', 'lucario', 'material-darker', 
		'material-ocean', 'material-palenight', 'material', 'mbo', 'mdn-like', 
		'midnight', 'monokai', 'moxer', 'neat', 'neo', 'night', 'nord', 'oceanic-next', 
		'panda-syntax', 'paraiso-dark', 'paraiso-light', 'pastel-on-dark', 'railscasts', 
		'rubyblue', 'seti', 'shadowfox', 'solarized', 'ssms', 'the-matrix', 
		'tomorrow-night-bright', 'tomorrow-night-eighties', 'ttcn', 'twilight', 
		'vibrant-ink', 'xq-dark', 'xq-light', 'yeti', 'yonce', 'zenburn'
	];
	
	let current_theme = editor.getOption("theme");
	let $par = $("#themes");
	for (let i = 0; i < themes.length; ++i) {
		$('head').append(`<link rel="stylesheet" href="codemirror/theme/${themes[i]}.css" type="text/css" />`);
		let $theme = $(`<label class="menuitem" id="theme-${themes[i]}">${themes[i]}</label>`);
		if (themes[i] == current_theme)
			$theme.addClass("active");
		$theme.click(function () {
			$("#theme-" + editor.getOption("theme")).removeClass("active");
			$(this).addClass("active");
			editor.setOption("theme", this.innerHTML);
		});
		$theme.appendTo($par);
	}
}

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
			editor.setOption(opt, elem.checked);
		});
	}

	bindToCallback("file-new", "click", onFileNew);
	bindToCallback("file-open", "change", onFileOpen.bind(this.files)); 
	bindToCallback("file-download", "click", onFileDownload);
	bindToCallback("file-download-all", "click", onFileDownloadAll);
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
	
	initThemes();
	bindToCallback("view-fontsize-up", "click", onViewFontSizeUp);
	bindToCallback("view-fontsize-down", "click", onViewFontSizeDown);
	editorSetFontSize(getCache("options:fontSize") || 10);	
	bindCheckboxToOption("view-linewrapping", "lineWrapping");
	bindCheckboxToOption("view-linenumbers", "lineNumbers");
	bindToCallback("view-console", "change", onViewConsole);
	document.getElementById("view-console").checked = Boolean(getCache(`options:viewConsole`));
	onViewConsole.call(document.getElementById("view-console"));
	
	bindToCallback("tab-new", "click", tabOnNew);
	bindToCallback("tab-rename", "click", function () { tabOnRename(tabActive); });
	bindToCallback("tab-move-left", "click", function () { tabOnMoveLeft(tabActive); });
	bindToCallback("tab-move-right", "click", function () { tabOnMoveRight(tabActive); });
	bindToCallback("tab-close", "click", function () { tabOnClose(tabActive); });

	//bindToCallback("tools-choose-colour", "click", onToolsChooseColourSelect);
	//bindToCallback("tools-choose-colour", "input", onToolsChooseColourInput);
	//bindToCallback("tools-choose-colour", "change", onToolsChooseColourChange);

	bindToCallback("options-indentunit", "click", onOptionsIndentUnit);
	bindToCallback("options-tabsize", "click", onOptionsTabSize);
	bindCheckboxToOption("options-smartindent", "smartIndent");
	bindCheckboxToOption("options-indentwithtabs", "indentWithTabs");
	bindCheckboxToOption("options-autoclosetags", "autoCloseTags");
	bindToCallback("options-resettodefault", "click", onOptionsResetToDefault);
}

function initTabBar()
{
	$("#new-tab").click(tabOnNew);
	let tabNames = getCache(`tabs:names`);
	if (!tabNames) {
		let newTab = tabCreate("new.html", true, true);
	}
	else {
		for (let i = 0; i < tabNames.length; ++i) {
			tabLoadFromCache(tabNames[i]);
		}
	}
}