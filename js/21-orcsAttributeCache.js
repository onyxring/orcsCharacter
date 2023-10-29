class orcsAttributeCache{
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
