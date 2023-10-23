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