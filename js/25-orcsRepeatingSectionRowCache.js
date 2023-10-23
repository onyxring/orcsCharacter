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
