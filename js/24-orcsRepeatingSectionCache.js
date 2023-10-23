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
