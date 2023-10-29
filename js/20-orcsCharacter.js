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
}