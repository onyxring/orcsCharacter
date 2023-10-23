
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
