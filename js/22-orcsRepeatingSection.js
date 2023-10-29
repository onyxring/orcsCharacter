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
        var rowIds = await getSectionIDsAsync(this._key);
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