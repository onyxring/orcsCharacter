//---------------------------------------
//-- 10-Roll20Async.min.js
function setActiveCharacterId(t) { var e = getActiveCharacterId(), r = { id: "0", type: "setActiveCharacter", data: t }; if (null == self.dispatchEvent) self.onmessage({ data: r }); else { var a = new CustomEvent("message"); a.data = r, self.dispatchEvent(a) } return e } var _sIn = setInterval; setInterval = function (t, e) { var r = getActiveCharacterId(); _sIn((function () { var e = setActiveCharacterId(r); t(), setActiveCharacterId(e) }), e) }; var _sto = setTimeout; function getAttrsAsync(t) { var e = getActiveCharacterId(), r = null; return new Promise(((a, c) => { r = setActiveCharacterId(e); try { getAttrs(t, (t => { a(t) })) } catch { c() } })).finally((() => { setActiveCharacterId(r) })) } function setAttrsAsync(t, e) { var r = getActiveCharacterId(), a = null; return new Promise(((c, n) => { a = setActiveCharacterId(r); try { setAttrs(t, e, (t => { c(t) })) } catch { n() } })).finally((() => { setActiveCharacterId(a) })) } function getSectionIDsAsync(t) { var e = getActiveCharacterId(), r = null; return new Promise(((a, c) => { r = setActiveCharacterId(e); try { getSectionIDs(t, (t => { a(t) })) } catch { c() } })).finally((() => { setActiveCharacterId(r) })) } function getSingleAttrAsync(t) { var e = getActiveCharacterId(), r = null; return new Promise(((a, c) => { r = setActiveCharacterId(e); try { getAttrs([t], (e => { a(e[t]) })) } catch { c() } })).finally((() => { setActiveCharacterId(r) })) } setTimeout = function (t, e) { var r = getActiveCharacterId(); _sto((function () { var e = setActiveCharacterId(r); t(), setActiveCharacterId(e) }), e) };
//---------------------------------------
//-- 20-orcsCharacter.js
//------------------------
// orcsCharacter.create()
// .cacheAsync(...)
// .getRepeatingAsync()
// .cacheRepeatingAsync()
// .getRowFromEvent() // need use cases for this
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

    static #attrHandler = {
        get: (obj, prop)=>{
            switch(prop){
                case "cacheAsync": //a method to create a cached attribute object
                    return (attributes) => { return orcsAttributeCache.createAsync(obj, attributes); };
                case "getEmptyCache": //a method to create a cached attribute object
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
                case "preferNumeric": return (flag)=>{ obj.preferNumeric = flag; };
                //TODO needs test case
                case "getRowFromEvent": //a method to lookup the passed in entry of a repeating section, from an event handler
                    return (eventInfo)=>{
                        var matches=eventInfo.sourceAttribute.match("repeating_([^_]*)_(.{20})_");
                        return orcsRepeatingSection.createRowProxy(matches[2], matches[1]);
                    };
            } 
            return getSingleAttrAsync(prop).then(val => {return obj._enforceDataType(val);});
        },
        set: async (obj, prop, value) => {
            prop = await Promise.resolve(prop); //if a user passed in a promise, resolve it first (Promise.resolve, returns a Promise, regardless of if it is or not)
            var json='{"'+prop+'":"'+value.toString().replaceAll(/"/gi,'\\"')+'"}';
            return setAttrsAsync(JSON.parse(json));
        }
    };
}

//---------------------------------------
//-- 21-orcsAttributeCache.js

class orcsAttributeCache{
    _cache = { _isDirty: {} };
    _parent;
    static create(parent){
        var retval = new orcsAttributeCache();
        retval._parent = parent;
        return new Proxy(retval, orcsAttributeCache.#attrHandler);
    }
    static async createAsync(parent, attributes) {
        var obj = new orcsAttributeCache();
        obj._parent = parent;
        var retval = new Proxy(obj, orcsAttributeCache.#attrHandler);
        await orcsAttributeCache.cacheAttrsAsync(retval, attributes);
        return retval;
    }
    static async cacheAttrsAsync(attrCache, attributes) {
        //preload any initial values that were provided
        if (attributes == null) return;
        var atrbList = "";
        attributes.forEach(attrib => {
            if (atrbList != "") atrbList = atrbList + ",";
            atrbList = atrbList + `"${attrib}"`;
        });
        atrbList = `[${atrbList}]`;
        var attrs = await getAttrsAsync(JSON.parse(atrbList));

        for (var attribute of attributes) {
            var val = attrs[attribute];
            if(val!=null) attrCache[attribute]=val;
        }
    }

    static #attrHandler = {
        get: (obj, prop)=>{
            switch(prop){  //even though we have only one test condition, we still use the kswitch pattern rather than "if", because this is the ideal pattern for a Proxy.get handler
                case "commitAsync": //write all changed attributes to the server at one time
                    return () => {
                        var json="";

                        for(var prop in obj._cache._isDirty){
                            if (obj._cache._isDirty[prop] != true) continue;
                            obj._cache._isDirty[prop] = false; //after we commit these, the attributes will be clean
                            if(json!="") json+=",";
                            json+=('"'+prop+'":"'+obj._cache[prop].toString().replaceAll(/"/gi,'\\"')+'"');
                        }
                        return setAttrsAsync(JSON.parse('{'+json+'}'));
                    }
                case "cacheAttrsAsync":
                    return (attributes) => {
                        return orcsAttributeCache.cacheAttrsAsync(obj, attributes);
                    }
            }
            //if(prop in obj._cache==false){
            //    obj._cache[prop]=getSingleAttrAsync(prop);
            //}
            return obj._parent._enforceDataType(obj._cache[prop]);
        },
        set: (obj, prop, value) => {
            //value = Promise.resolve(value); //if a user passed in a promise, resolve it first (Promise.resolve, returns a Promise, regardless of if it is or not)
            //value.then(v => {  //although we might be waiting for a passed in value to be resolved, we are not actually awaiting the assignment to the cache
                obj._cache[prop] = value;
                obj._cache._isDirty[prop] = true;
            //    return value;
            //});
            return value;
            //return new Promise(resolve => { resolve(value); });
        }
    };
}


//---------------------------------------
//-- 22-orcsRepeatingSection.js
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
        var rowIds = await getSectionIDsAsync(this._key)
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
}

//---------------------------------------
//-- 23-orcsRepeatingSectionRow.js
class orcsRepeatingSectionRow{
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
}

//---------------------------------------
//-- 24-orcsRepeatingSectionCache.js
class orcsRepeatingSectionCache extends Array{
    _parent = null;
    _sectionName = "";

    static async createAsync(characterObj, sectionName) {
        var retval = new orcsRepeatingSectionCache();
        retval._parent = characterObj;
        retval._sectionName = sectionName;
        await retval.hydrateAsync();
        return retval;
    }
    //toJSON() { return "<Object:orcsRepeatingSectionCache>";   }
    createRowProxy(rowId) {
        if (rowId == null) rowId = generateRowID();
        return orcsRepeatingSectionRowCache.create(this, rowId); 
    }
    addNew(attribs) {
        var newRow = this.createRowProxy();
        if(attribs==null) attribs={};
        for (var prop in attribs) {
            newRow[prop] = attribs[prop];
        }
        this.push(newRow);
        return newRow;
    };
    async hydrateAsync() {
        var rowIds = await getSectionIDsAsync(this._key);
        for(var rowId of rowIds)
            this.push(this.createRowProxy(rowId));
    }
    async commitAsync() {
        var json = {};
        this.map(i=>i).forEach(row => {  
            if (row._isDeleted) {
                 removeRepeatingRow(row._proxy._key);
                 this.splice(this.indexOf(row), 1);  //remove it from the underlying array too
             }
             else
                 json = { ...json, ...row.getCommitJson() };
        });
        return setAttrsAsync(json);
    }

    async cacheAsync(attributes) {
        var atrbList = "";
        this.forEach(row => {
            attributes.forEach(attrib => {
                if (atrbList != "") atrbList = atrbList + ",";
                atrbList = atrbList + `"${row._propKey(attrib)}"`;
            });
        });
        atrbList = `[${atrbList}]`;
        var values = await getAttrsAsync(JSON.parse(atrbList));
        this.forEach(row => {
            attributes.forEach(attrib => {
                row._cache[attrib] = values[row._propKey(attrib)];
            });
        });
    }
    get _key() { return `repeating_${this._sectionName}`; }
    get _rootCharacterObj() {
        return this._parent;
    }   
}
//---------------------------------------
//-- 25-orcsRepeatingSectionRowCache.js
class orcsRepeatingSectionRowCache{
    _parent;
    _rowId; 
    _cache = {};
    _isDirty = {};
    _isDeleted = false;
    

    static create(parent,rowId) {
        var retval = new orcsRepeatingSectionRowCache();
        retval._rowId  = rowId;
        retval._parent = parent;
        retval._proxy = retval;
        return new Proxy(retval, orcsRepeatingSectionRowCache.#repeatingSectionRowCacheHandler);
    }
        
    static #repeatingSectionRowCacheHandler={
        get:(obj,prop)=>{

            switch (prop) {
                case "_rowId": return obj._rowId;
                case "_proxy": return obj._proxy;
                case "_cache": return obj._cache;
                case "_isDeleted": return obj._isDeleted;
                case "_propKey": return (prop) => { return obj._propKey(prop); }
                case "delete": return () => { obj._isDeleted = true; };
                case "undelete": return ()=>{obj._isDeleted=false;};
                case "getCommitJson": return () => {
                    if (obj._isDeleted == true) return "";
                    var json="";
                    for (var attrb in obj._cache) {
                        if (obj._isDirty[attrb] != true) continue;
                        if(json!="") json+=",";
                        json+=('"'+obj._propKey(attrb)+'":"'+obj._cache[attrb].toString().replaceAll(/"/gi,'\\"')+'"');
                    }
                    return JSON.parse('{'+json+'}');
                }
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
//---------------------------------------
//-- 29-orcsCharacterSetup.js
var pc=orcsCharacter.create();