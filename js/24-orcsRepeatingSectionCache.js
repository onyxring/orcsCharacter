class orcsRepeatingSectionCache extends Array{
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
