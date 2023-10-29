//-------------------------------------------------------------------------------------
// Roll20Async
// Compensates for a defect in the underlying Roll20 system, where it "loses context"
// (forgets which player is active) during asynchronous methods and callbacks, 
// resulting in error messages like:
//
//      Error: Trying to do getAttrs when no character is active in sandbox.
//
// Include this module to have setTimeout() and setInterval() just start working as 
// expected; no additional setup required.  Additionally, async-safe versions of the
// typical attribute functions will be available:
//
//      getAttrsAsync
//      setAttrsAsync
//      getSectionIDsAsync
//      
function isRunningOnServer() { return self.dispatchEvent == undefined; }
function setActiveCharacterId(charId){
    var oldAcid=getActiveCharacterId();
    var msg={"id":"0", "type":"setActiveCharacter", "data":charId};
    
    if(isRunningOnServer()==false){ //if in a browser, use "dispatchEvent" to process the message
        var ev = new CustomEvent("message");
        ev.data=msg; 
        self.dispatchEvent(ev);
    }else{ //otherwise, use the API (server) message processor, "onmessage"
        self.onmessage({data:msg});
    }
    return oldAcid; //return what the value used to be, so calling code can be a little cleaner 
} 
var _sIn=setInterval;
setInterval=function(callback, timeout){
    var acid=getActiveCharacterId();
    _sIn(
        function(){
            var prevAcid=setActiveCharacterId(acid);
            callback();
            setActiveCharacterId(prevAcid);
        }
    ,timeout);
}
var _sto=setTimeout
setTimeout=function(callback, timeout){
    var acid=getActiveCharacterId();
    _sto(
        function(){
            var prevAcid=setActiveCharacterId(acid);
            callback();
            setActiveCharacterId(prevAcid);
        }
    ,timeout);
}
function getAttrsAsync(props){
    var acid=getActiveCharacterId(); //save the current activeCharacterID in case it has changed when the promise runs 
    var prevAcid=null;               //local variable defined here, because it needs to be shared across the promise callbacks defined below
    return new Promise((resolve,reject)=>{
            prevAcid=setActiveCharacterId(acid);  //in case the activeCharacterId has changed, restore it to what we were expecting and save the current value to restore later
            try{
                getAttrs(props,(values)=>{  resolve(values); }); 
            }
            catch{ reject(); }
    }).finally(()=>{
        setActiveCharacterId(prevAcid); //restore activeCharcterId to what it was when the promise first ran
    });
}
//use the same pattern for each of the following...
function setAttrsAsync(propObj, options){
    var acid=getActiveCharacterId(); 
    var prevAcid=null;               
    return new Promise((resolve,reject)=>{
            prevAcid=setActiveCharacterId(acid);  
            try{
                setAttrs(propObj,options,(values)=>{ resolve(values); });
            }
            catch{ reject(); }
    }).finally(()=>{
        setActiveCharacterId(prevAcid); 
    });
}

function getSectionIDsAsync(sectionName){
    var acid = getActiveCharacterId(); 
    var prevAcid=null;               
    return new Promise((resolve,reject)=>{
            prevAcid = setActiveCharacterId(acid);  
            try{
                getSectionIDs(sectionName,(values)=>{ resolve(values); });
            }
            catch{ reject(); }
    }).finally(()=>{
        setActiveCharacterId(prevAcid); 
    });
}

//------------------------------------------------------------------------------------------------
// orcsCharacter
// The core class for the orcsCharacter script.  All other classes are instantiated 
// via this object, or off of objects instantiated from this object.
class orcsCharacter{
    // We use create() instead of "new" since we use this as a Proxy.
    //      var pc = orcsCharacter.create();
    static create() {
        var char = new orcsCharacter();  //create a new character object
        char.preferNumeric = true;
        char.proxy = new Proxy(char, orcsCharacter.#attrHandler); //wrap it in a proxy
        return char.proxy;
    }
    _enforceDataType(val) {
        if (!this.preferNumeric) return val;
        var num = +val;
        if (val == null || val == undefined) return 0; 
        if (isNaN(num)) return val;
        return num;
    }
    //a simple helper, to get the value of a single attribute 
    static _getSingleAttrAsync(prop) {
        var acid = getActiveCharacterId();
        var prevAcid = null;
        return new Promise((resolve, reject) => {
            prevAcid = setActiveCharacterId(acid);
            try {
                getAttrs([prop], (values) => { resolve(values[prop]); });
            }
            catch { reject(); }
        }).finally(() => {
            setActiveCharacterId(prevAcid);
        });
    }

    static #attrHandler = {
        get: (obj, prop)=>{
            switch(prop){
                case "cacheAsync": //a method to create a cached attribute object
                    return (attributes) => { return orcsAttributeCache.createAsync(obj, attributes); };
                case "getEmptyCache": //a method to create an empty cached attribute object
                    return () => { return orcsAttributeCache.create(); };
                case "getRepeatingAsync":  //a method to create a repeating section object
                    return async (sectionName) => {
                        return orcsRepeatingSection.createAsync(obj, sectionName);
                    };
                case "cacheRepeatingAsync": //a method to create a cached repeating section object
                    return async (sectionName, attributes) => {
                        var rsc = await orcsRepeatingSectionCache.createAsync(obj,sectionName);
                        await rsc.cacheAsync(attributes);
                        return rsc;
                    };
                case "cacheMultipleAsync": return async (attributes, sectionsRequestObject) => { return await orcsMultiCacheController.createAsync(obj, attributes, sectionsRequestObject); };
                case "preferNumeric": return (flag)=>{ obj.preferNumeric = flag; };
                //TODO needs test case
                case "getRowFromEvent": //a method to lookup the passed in entry of a repeating section, from an event handler
                    return (eventInfo)=>{
                        var matches=eventInfo.sourceAttribute.match("repeating_([^_]*)_(.{20})_");
                        return orcsRepeatingSection.createRowProxy(matches[2], matches[1]);
                    };
            } 
            return orcsCharacter._getSingleAttrAsync(prop).then(val => {return obj._enforceDataType(val);});
        },
        set: async (obj, prop, value) => {
            prop = await Promise.resolve(prop); //if a user passed in a promise, resolve it first (Promise.resolve, returns a Promise, regardless of if it is or not)
            var json='{"'+prop+'":"'+value.toString().replaceAll(/"/gi,'\\"')+'"}';
            return setAttrsAsync(JSON.parse(json));
        }
    };
}class orcsAttributeCache{
    _cache = { _isDirty: {} };
    _parent;
    _attributes;
    _proxy;
    static create(parent){
        var retval = new orcsAttributeCache();
        retval._parent = parent;
        retval._proxy = new Proxy(retval, orcsAttributeCache.#attrHandler);
        return retval._proxy;
    }
    static async createAsync(parent, attributes) {
        var obj = new orcsAttributeCache();
        obj._parent = parent;
        obj._attributes = attributes;
        var retval = new Proxy(obj, orcsAttributeCache.#attrHandler);
        await obj.cacheAttrsAsync(attributes);
        return retval;
    }
    async cacheAttrsAsync(attributes) {
        //preload any initial values that were provided
        if (attributes == null) return;
        var atrbList = this.getAttributeRequestList();
        
        atrbList = `[${atrbList}]`;
        var values = await getAttrsAsync(JSON.parse(atrbList));

        this.hydrateResponse(attributes, values);
    }
    
    getAttributeRequestList(attributes) {
        if (attributes == null) attributes = this._attributes;
        var atrbList = "";
        attributes.forEach(attrib => {
            if (atrbList != "") atrbList = atrbList + ",";
            atrbList = atrbList + `"${attrib}"`;
        });
        return atrbList;
    }
    hydrateResponse(attributes, response) {
        for (var attribute of attributes) {
            var val = response[attribute];
            if (val != null) this._proxy[attribute] = val;    
        } 
        this.clean();
    }
    getCommitJson() {
        var json="";

        for(var prop in this._cache._isDirty){
            if (this._cache._isDirty[prop] != true) continue;
            if(json!="") json+=",";
            json+=('"'+prop+'":"'+this._cache[prop].toString().replaceAll(/"/gi,'\\"')+'"');
        }
        return JSON.parse("{" + json + "}");
    }
    clean() {
        this._cache._isDirty = {};
    }
    commitAsync() {
        var commitJson = this.getCommitJson();
        this.clean();
        return setAttrsAsync(json);
    }
    static #attrHandler = {
        get: (obj, prop)=>{
            switch(prop){  
                case "getProxyTarget": return () => { return obj; };
                case "commitAsync": return () => { obj.commitAsync(); };
                case "clean": return () => { obj.clean(); }
                //case "cacheAttrsAsync":
                  //  return (attributes) => {
                    //    return orcsAttributeCache.cacheAttrsAsync(obj, attributes);
                    //}
                case "getAttributeRequestList": return (attrs) => { return obj.getAttributeRequestList(attrs); }
                case "getCommitJson": return () => { return obj.getCommitJson(); };
            }
            return obj._parent._enforceDataType(obj._cache[prop]);
        },
        set: (obj, prop, value) => {
            obj._cache[prop] = value;
            obj._cache._isDirty[prop] = true;
            return value;
        }
    };
}
class orcsRepeatingSection extends Array{
    _parent = null;
    _sectionName = "";

    static async createAsync(characterObj, sectionName) {
        var retval = new orcsRepeatingSection();
        retval._parent = characterObj;
        retval._sectionName = sectionName;
        await retval.hydrateAsync();
        return retval;
    }

    createRowProxy(rowId) {
        if (rowId == null) rowId = generateRowID();
        return orcsRepeatingSectionRow.create(this, rowId);
    }
    addNew(attribs) {
        var newRow = this.createRowProxy();
        if(attribs==null) attribs={};
        for (var prop in attribs) newRow[prop]=attribs[prop];
        return newRow;
    };
    async hydrateAsync() {
        var rowIds = await getSectionIDsAsync(this._key);
        for(var rowId of rowIds){
            this.push(this.createRowProxy(rowId));
        }
    }
    get _key() { return `repeating_${this._sectionName}`; }
    get _rootCharacterObj() { return this._parent; }

 /*           //TODO...  Need a test case for this...
            if (section == "eventRow") {
                return (eventInfo)=>{
                    var matches=eventInfo.sourceAttribute.match("repeating_([^_]*)_(.{20})_");
                    return orcsRepeatingSection.createRowProxy(obj._charObj, matches[2], matches[1]);
                };
            };

            
        }
    };*/
}class orcsRepeatingSectionRow{
    _parent;
    _rowId;    
    
    static create(repeatingSection,rowId) {
        var retval = new orcsRepeatingSectionRow();
        retval._rowId  = rowId;
        retval._parent = repeatingSection;
        return new Proxy(retval, orcsRepeatingSectionRow.#repeatingSectionRowHandler);
    }
    static #repeatingSectionRowHandler={
        get: (obj,prop)=>{
            switch (prop) {
                case "delete": return () => { removeRepeatingRow(obj._key) };
                case "_rowId": return obj._rowId;
            }
            return obj._rootCharacterObj.proxy[obj._propKey(prop)].then(val => { 
                return obj._rootCharacterObj._enforceDataType(val);
            }); 
        },
        set: async (obj, prop, value) => {
            return obj._rootCharacterObj.proxy[obj._propKey(prop)] = value;
        }
    };
  
    get _rootCharacterObj() {
        return this._parent._parent;
    }
    get _key() {
        return this._parent._key+"_"+this._rowId;
    }
    _propKey(prop) {
        return this._parent._key+"_"+this._rowId+"_"+prop;
    }
}class orcsRepeatingSectionCache extends Array{
    _parent = null;
    _sectionName = "";

    static create(characterObj, sectionName) {
        var retval = new orcsRepeatingSectionCache();
        retval._parent = characterObj;
        retval._sectionName = sectionName;
        return retval;
    }
    static async createAsync(characterObj, sectionName) {
        var retval = new orcsRepeatingSectionCache();
        retval._parent = characterObj;
        retval._sectionName = sectionName;
        await retval.initializeAsync();
        return retval;
    }
    //initialization equates to: 1) retrieving a list of row IDs, and 2) populating the list of row proxies, one for each row ID
    async initializeAsync() {
        var rowIds = await getSectionIDsAsync(this._key);
        for (var rowId of rowIds)
            this.push(this.createRowProxy(rowId));  
    }
    createRowProxy(rowId) {
        if (rowId == null) rowId = generateRowID();  //if no rowID is supplied, then assume this is a new row
        return orcsRepeatingSectionRowCache.create(this, rowId); 
    }
    
    addNew(attribsAndValues) {
        var newRow = this.createRowProxy();
        if(attribsAndValues==null) attribsAndValues={};
        for (var prop in attribsAndValues) 
            newRow[prop] = attribsAndValues[prop]; //set these rows individually, the values will be marked dirty and included in the next commit
        
        this.push(newRow);
        return newRow;
    };
    async commitAsync() {
        var json = this.getCommitJson();
        this.commitDeletedRows();
        this.cleanAll();
        return setAttrsAsync(json);
    }
    commitDeletedRows() {
        this.map(i=>i).forEach(row => {  
            if (row._isDeleted) {
                removeRepeatingRow(row.getProxyTarget()._key);
                this.splice(this.indexOf(row), 1);  //remove it from the underlying array too
            }
        });
    }
    //set all fields on all rows as clean, so they will not be generated on the next commit
    cleanAll() {
        this.forEach(row => row.clean());
    }
    //returns a json object of the field/values which are dirty and need to be updated
    getCommitJson() {
        var json = {};
        //this.map(i=>i).forEach(row => {  
        this.forEach(row => {  
            json = { ...json, ...row.getProxyTarget().getCommitJson() };
        }); 
        return json;
    }
    //given a list of attributes, this function returns a string list key pointers to those values, in the format expected by getAttrs...
    getAttributeRequestList(attributes) {
        var atrbList = "";
        this.forEach(row => {
            attributes.forEach(attrib => {
                if (atrbList != "") atrbList = atrbList + ",";
                atrbList = atrbList + `"${row.getProxyTarget()._propKey(attrib)}"`;
            });
        });
        return atrbList;
    }
    //given a list of attribute names and a response from getAttrs, this function will pick the appropriate values
    //from the response which make sense for this section, assign them to the correct rows, and ignore the rest
    hydrateResponse(attributes, response) {
        this.forEach(row => {
            attributes.forEach(attrib => {
                row.getProxyTarget()._cache[attrib] = response[row.getProxyTarget()._propKey(attrib)];
            });
            row.clean();
        });
    }
    //give a list of attribute names, this function will retrieve the values of those attributes for all rows and assign 
    //them accordingly
    async cacheAsync(attributes) {
        var atrbList = this.getAttributeRequestList(attributes);
        atrbList = `[${atrbList}]`;
        var values = await getAttrsAsync(JSON.parse(atrbList));
        this.hydrateResponse(attributes,values);
    }
    get _key() { return `repeating_${this._sectionName}`; }
    get _rootCharacterObj() {
        return this._parent;
    }   
}
class orcsRepeatingSectionRowCache{
    _parent;    //the parent object is the orcsRepeatingSectionCache
    _rowId;     //the unique identifier for this row
    _cache = {};//the cached values
    _isDirty = {};//we track the values that have been changed
    _isDeleted = false; //has this row been marked for deletion
    _proxy = null;  //the proxy which is exposed to users

    static create(parent,rowId) {
        var retval = new orcsRepeatingSectionRowCache();
        retval._rowId  = rowId;
        retval._parent = parent;
        retval._proxy = retval;
        return new Proxy(retval, orcsRepeatingSectionRowCache.#repeatingSectionRowCacheHandler);
    }
    getCommitJson() {
        if (this._isDeleted == true) return "";
        var json = "";
        for (var attrb in this._cache) {
            if (this._isDirty[attrb] != true) continue;
            if (json != "") json += ",";
            json += ('"' + this._propKey(attrb) + '":"' + this._cache[attrb].toString().replaceAll(/"/gi, '\\"') + '"');
        }
        return JSON.parse('{' + json + '}');
    }
    clean() {
        //for (var attrb in obj._cache) obj._isDirty[attrb] = false;
        this._isDirty = [];
    }
    static #repeatingSectionRowCacheHandler={
        get:(obj,prop)=>{

            switch (prop) {
                case "getProxyTarget": return () => { return obj; };
                case "_rowId": return obj._rowId;
                case "_isDeleted": return obj._isDeleted;
                case "clean": return () => { return obj.clean() };
                case "delete": return () => { obj._isDeleted = true; };
                case "undelete": return ()=>{obj._isDeleted=false;};
            }
            return obj._rootCharacterObj._enforceDataType(obj._cache[prop]);
        },
        set: (obj, prop, value) => {
            obj._isDirty[prop] = true;
            return obj._cache[prop] = value;
        }
    }
    get _rootCharacterObj() { return this._parent._parent; }
    get _key() { return this._parent._key + "_" + this._rowId; }
    _propKey(prop) { return this._key+"_"+prop; }
}
//-----------------------------------------------------------------------------
//orcsMultiCacheController 
//Optimizes loading and saving attributes by combining the gets and sets of 
//basic attributes and repeating sections
class orcsMultiCacheController {
    attributes = null;  //an orcsAttributeCache object
    sections = {};      //on object of named orcsRepeatingSectionCache objects
    _parent = {};       //the parent object, typically the root orcsCharacter object
    _attributeNames = [];   //an array of attribute names which this object is meant to cache
    _sectionsRequestObject = {}; //an object of named repeating sections and arrays of the attributes to cache
    
    static async createAsync(characterObj, attributeNames, sectionsRequestObject) {
        //if the user asked for repeating sections, but not a list of attributes...
        if (sectionsRequestObject == null && typeof attributeNames == "object" && Array.isArray(attributeNames) == false) { 
            sectionsRequestObject = attributeNames;
            attributeNames = [];
        }
        var retval = new orcsMultiCacheController();
        retval._parent = characterObj;
        retval._attributeNames = attributeNames;
        retval._sectionsRequestObject = sectionsRequestObject;
        await retval.hydrateAsync();
        return retval;
    }
  
    //create empty versions of all the cached objects which have been requested, then populate them from a single attribute request 
    async hydrateAsync() {
        this.attributes = orcsAttributeCache.create(this._parent); //empty attributes object
    
        //for repeating sections, we pull in the sectionIDs for existing rows, per section
        //since we don't have an option to do multiple sections in a single call, we'll kick them all off together, running in parallel
        var promises = [];
        for (var sectionName in this._sectionsRequestObject) {
            var section = orcsRepeatingSectionCache.create(this._parent, sectionName); //create an empty cached repeating section object
            this.sections[sectionName] = section; 
            promises.push(section.initializeAsync()); //initialize it with row ids.  Note we do NOT await, but let all run concurrently
        }
        await Promise.all(promises); //now we wait until all the parallel async calls return

        //make a single call and get all values (base attributes and repeating section values) at once...
        var values = await getAttrsAsync(JSON.parse("[" + this.getAttributeRequestList() + "]"));
        
        //pull all returned attribute values into their coresponding objects
        this.attributes.getProxyTarget().hydrateResponse(this._attributeNames, values); //character attributes
        for (var sectionName in this.sections) {
            this.sections[sectionName].hydrateResponse(this._sectionsRequestObject[sectionName], values); //repeating sections
        }
    }
    //return a list of attributes required to populate/hydrate cached attributes and repeating sections
    getAttributeRequestList() {
        var list = this.attributes.getAttributeRequestList(this._attributeNames);
        
        for (var sectionName in this._sectionsRequestObject) {
            var section = this.sections[sectionName];
            if (list != "") list = list + ",";
            list = list + section.getAttributeRequestList(this._sectionsRequestObject[sectionName]);
        };
        return list;
    }
    //get all the JSON from all the objects and munge it together, then commit it at one time
    async commitAsync() {
        var json = this.attributes.getCommitJson();

        for (var sectionName in this.sections) {
            var section = this.sections[sectionName];
            section.commitDeletedRows();
            json = { ...json, ...section.getCommitJson() }; 
            section.cleanAll();
        }
        return setAttrsAsync(json); 
    }
}var pc=orcsCharacter.create();
