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
