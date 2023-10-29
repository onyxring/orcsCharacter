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
}