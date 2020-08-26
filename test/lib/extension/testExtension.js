
import { Extension } from "../../../lib/extension/extension";

describe('GeoPackage Extension tests', function() {

  it('should create an extension', function() {
    var extension = new Extension();
    extension.setExtensionName('author', 'name');
    extension.extension_name.should.be.equal('author_name');
  });

});
