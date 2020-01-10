import proj4 from 'proj4'
import {UserDao} from '../../user/userDao'
import {TileMatrixDao} from '../matrix/tileMatrixDao';
import {TileMatrixSetDao} from '../matrixset/tileMatrixSetDao';
import TileRow from './tileRow';
import TileColumn from './tileColumn';
import TileGrid from '../tileGrid';
import ColumnValues from '../../dao/columnValues'
import { TileMatrix } from '../matrix/tileMatrix'
import { TileBoundingBoxUtils } from '../tileBoundingBoxUtils';
import { BoundingBox } from '../../boundingBox';
import SpatialReferenceSystem from '../../core/srs/spatialReferenceSystem';
import { TileMatrixSet } from '../matrixset/tileMatrixSet';
import GeoPackage from '../../geoPackage';
import TileTable from './tileTable';

/**
 * `TileDao` is a {@link module:dao/dao~Dao} subclass for reading
 * [user tile tables]{@link module:tiles/user/tileTable~TileTable}.
 *
 * @class TileDao
 * @extends UserDao
 * @param  {GeoPackageConnection} connection
 * @param  {TileTable} table
 * @param  {TileMatrixSet} tileMatrixSet
 * @param  {TileMatrix[]} tileMatrices
 */
export class TileDao extends UserDao<TileRow> {
  zoomLevelToTileMatrix: TileMatrix[];
  widths: number[];
  heights: number[];
  minZoom: number;
  maxZoom: number;
  srs: any;
  projection: string;
  minWebMapZoom: number;
  maxWebMapZoom: number;
  webZoomToGeoPackageZooms: {};
  constructor(geoPackage: GeoPackage, public table: TileTable, public tileMatrixSet: TileMatrixSet, public tileMatrices: TileMatrix[]) {
    super(geoPackage, table);
    this.zoomLevelToTileMatrix = [];
    this.widths = [];
    this.heights = [];
    if (tileMatrices.length === 0) {
      this.minZoom = 0;
      this.maxZoom = 0;
    }
    else {
      this.minZoom = this.tileMatrices[0].zoom_level;
      this.maxZoom = this.tileMatrices[this.tileMatrices.length - 1].zoom_level;
    }
    // Populate the zoom level to tile matrix and the sorted tile widths and heights
    for (var i = this.tileMatrices.length - 1; i >= 0; i--) {
      var tileMatrix = this.tileMatrices[i];
      this.zoomLevelToTileMatrix[tileMatrix.zoom_level] = tileMatrix;
    }
    this.initialize();
  }
  initialize() {
    var tileMatrixSetDao = this.geoPackage.getTileMatrixSetDao();
    this.srs = tileMatrixSetDao.getSrs(this.tileMatrixSet);
    this.projection = this.srs.organization.toUpperCase() + ':' + this.srs.organization_coordsys_id;
    // Populate the zoom level to tile matrix and the sorted tile widths and heights
    for (var i = this.tileMatrices.length - 1; i >= 0; i--) {
      var tileMatrix = this.tileMatrices[i];
      var width = tileMatrix.pixel_x_size * tileMatrix.tile_width;
      var height = tileMatrix.pixel_y_size * tileMatrix.tile_height;
      var proj4Projection = proj4(this.projection);
      // @ts-ignore
      if (proj4Projection.to_meter) {
        // @ts-ignore
        width = proj4Projection.to_meter * tileMatrix.pixel_x_size * tileMatrix.tile_width;
        // @ts-ignore
        height = proj4Projection.to_meter * tileMatrix.pixel_y_size * tileMatrix.tile_height;
      }
      this.widths.push(width);
      this.heights.push(height);
    }
    this.setWebMapZoomLevels();
  }
  webZoomToGeoPackageZoom(webZoom: number): number {
    var webMercatorBoundingBox = TileBoundingBoxUtils.getWebMercatorBoundingBoxFromXYZ(0, 0, webZoom);
    return this.determineGeoPackageZoomLevel(webMercatorBoundingBox, webZoom);
  }
  setWebMapZoomLevels() {
    this.minWebMapZoom = 20;
    this.maxWebMapZoom = 0;
    this.webZoomToGeoPackageZooms = {};
    var totalTileWidth = this.tileMatrixSet.max_x - this.tileMatrixSet.min_x;
    var totalTileHeight = this.tileMatrixSet.max_y - this.tileMatrixSet.min_y;
    for (var i = 0; i < this.tileMatrices.length; i++) {
      var tileMatrix = this.tileMatrices[i];
      var singleTileWidth = totalTileWidth / tileMatrix.matrix_width;
      var singleTileHeight = totalTileHeight / tileMatrix.matrix_height;
      var tileBox = new BoundingBox(this.tileMatrixSet.min_x, this.tileMatrixSet.min_x + singleTileWidth, this.tileMatrixSet.min_y, this.tileMatrixSet.min_y + singleTileHeight);
      var proj4Projection = proj4(this.projection, 'EPSG:4326');
      var ne = proj4Projection.forward([tileBox.maxLongitude, tileBox.maxLatitude]);
      var sw = proj4Projection.forward([tileBox.minLongitude, tileBox.minLatitude]);
      var width = (ne[0] - sw[0]);
      var zoom = Math.ceil(Math.log2(360 / width));
      if (this.minWebMapZoom > zoom) {
        this.minWebMapZoom = zoom;
      }
      if (this.maxWebMapZoom < zoom) {
        this.maxWebMapZoom = zoom;
      }
      this.webZoomToGeoPackageZooms[zoom] = tileMatrix.zoom_level;
    }
  }
  determineGeoPackageZoomLevel(webMercatorBoundingBox: BoundingBox, zoom: number): number {
    return this.webZoomToGeoPackageZooms[zoom];
  }
  /**
   * Get the bounding box of tiles at the zoom level
   * @param  {Number} zoomLevel zoom level
   * @return {BoundingBox}           bounding box of the zoom level, or null if no tiles
   */
  getBoundingBoxWithZoomLevel(zoomLevel: number): BoundingBox {
    var boundingBox;
    var tileMatrix = this.getTileMatrixWithZoomLevel(zoomLevel);
    if (tileMatrix) {
      var tileGrid = this.queryForTileGridWithZoomLevel(zoomLevel);
      if (tileGrid) {
        var matrixSetBoundingBox = this.getBoundingBox();
        boundingBox = TileBoundingBoxUtils.getTileGridBoundingBox(matrixSetBoundingBox, tileMatrix.matrix_width, tileMatrix.matrix_height, tileGrid);
      }
      return boundingBox;
    }
    else {
      return boundingBox;
    }
  }
  getBoundingBox(): BoundingBox {
    return this.tileMatrixSet.getBoundingBox();
  }
  queryForTileGridWithZoomLevel(zoomLevel: number): TileGrid {
    var where = this.buildWhereWithFieldAndValue(TileColumn.COLUMN_ZOOM_LEVEL, zoomLevel);
    var whereArgs = this.buildWhereArgs(zoomLevel);
    var minX = this.minOfColumn(TileColumn.COLUMN_TILE_COLUMN, where, whereArgs);
    var maxX = this.maxOfColumn(TileColumn.COLUMN_TILE_COLUMN, where, whereArgs);
    var minY = this.minOfColumn(TileColumn.COLUMN_TILE_ROW, where, whereArgs);
    var maxY = this.maxOfColumn(TileColumn.COLUMN_TILE_ROW, where, whereArgs);
    var tileGrid;
    if (minX != null && minY != null && maxX != null && maxY != null) {
      tileGrid = new TileGrid(minX, maxX, minY, maxY);
    }
    return tileGrid;
  }
  /**
   * Get the tile grid of the zoom level
   * @param  {Number} zoomLevel zoom level
   * @return {TileGrid}           tile grid at zoom level, null if no tile matrix at zoom level
   */
  getTileGridWithZoomLevel(zoomLevel: number): TileGrid {
    var tileGrid;
    var tileMatrix = this.getTileMatrixWithZoomLevel(zoomLevel);
    if (tileMatrix) {
      tileGrid = new TileGrid(0, ~~tileMatrix.matrix_width - 1, 0, ~~tileMatrix.matrix_height - 1);
    }
    return tileGrid;
  }
  /**
   * get the tile table
   * @return {TileTable} tile table
   */
  getTileTable(): TileTable {
    return this.table;
  }
  /**
   * Create a new tile row with the column types and values
   * @param  {Array} columnTypes column types
   * @param  {Array} values      values
   * @return {TileRow}             tile row
   */
  newRowWithColumnTypes(columnTypes: string[], values: any[]): TileRow {
    return new TileRow(this.getTileTable(), columnTypes, values);
  }
  /**
   * Create a new tile row
   * @return {TileRow} tile row
   */
  newRow(): TileRow {
    return new TileRow(this.getTileTable());
  }
  /**
   * Adjust the tile matrix lengths if needed. Check if the tile matrix width
   * and height need to expand to account for pixel * number of pixels fitting
   * into the tile matrix lengths
   */
  adjustTileMatrixLengths() {
    var tileMatrixWidth = this.tileMatrixSet.max_x - this.tileMatrixSet.min_x;
    var tileMatrixHeight = this.tileMatrixSet.max_y - this.tileMatrixSet.min_y;
    for (var i = 0; i < this.tileMatrices.length; i++) {
      var tileMatrix = this.tileMatrices[i];
      var tempMatrixWidth = ~~((tileMatrixWidth / (tileMatrix.pixel_x_size * ~~tileMatrix.tile_width)));
      var tempMatrixHeight = ~~((tileMatrixHeight / (tileMatrix.pixel_y_size * ~~(tileMatrix.tile_height))));
      if(tempMatrixWidth > ~~(tileMatrix.matrix_width)) {
        tileMatrix.matrix_width = ~~(tempMatrixWidth);
      }
      if (tempMatrixHeight > ~~(tileMatrix.matrix_height)) {
        tileMatrix.matrix_height = ~~(tempMatrixHeight);
      }
    }
  }
  /**
   * Get the tile matrix at the zoom level
   * @param  {Number} zoomLevel zoom level
   * @returns {TileMatrix}           tile matrix
   */
  getTileMatrixWithZoomLevel(zoomLevel: number): TileMatrix {
    return this.zoomLevelToTileMatrix[zoomLevel];
  }
  /**
   * Query for a tile
   * @param  {Number} column    column
   * @param  {Number} row       row
   * @param  {Number} zoomLevel zoom level
   */
  queryForTile(column: number, row: number, zoomLevel: number): TileRow {
    var fieldValues = new ColumnValues();
    fieldValues.addColumn(TileColumn.COLUMN_TILE_COLUMN, column);
    fieldValues.addColumn(TileColumn.COLUMN_TILE_ROW, row);
    fieldValues.addColumn(TileColumn.COLUMN_ZOOM_LEVEL, zoomLevel);
    var tileRow;
    for (var rawRow of this.queryForFieldValues(fieldValues)) {
      tileRow = this.getRow(rawRow);
    }
    return tileRow;
  }
  queryForTilesWithZoomLevel(zoomLevel: number): IterableIterator<TileRow> {
    var iterator = this.queryForEach(TileColumn.COLUMN_ZOOM_LEVEL, zoomLevel);
    return {
      [Symbol.iterator]() {
        return this;
      },
      next: () => {
        var nextRow = iterator.next();
        if (!nextRow.done) {
          return {
            value: this.getRow(nextRow.value),
            done: false
          };
        }
        return {
          value: undefined,
          done: true
        };
      }
    };
  }
  /**
   * Query for Tiles at a zoom level in descending row and column order
   * @param  {Number} zoomLevel    zoom level
   * @returns {IterableIterator<TileRow>}
   */
  queryForTilesDescending(zoomLevel: number): IterableIterator<TileRow> {
    var iterator = this.queryForEach(TileColumn.COLUMN_ZOOM_LEVEL, zoomLevel, undefined, undefined, TileColumn.COLUMN_TILE_COLUMN + ' DESC, ' + TileColumn.COLUMN_TILE_ROW + ' DESC');
    return {
      [Symbol.iterator]() {
        return this;
      },
      next: () => {
        var nextRow = iterator.next();
        if (!nextRow.done) {
          return {
            value: this.getRow(nextRow.value),
            done: false
          };
        }
        return {
          value: undefined,
          done: true
        };
      }
    };
  }
  /**
   * Query for tiles at a zoom level and column
   * @param  {Number} column       column
   * @param  {Number} zoomLevel    zoom level
   * @returns {IterableIterator<TileRow>}
   */
  queryForTilesInColumn(column: number, zoomLevel: number): IterableIterator<TileRow> {
    var fieldValues = new ColumnValues();
    fieldValues.addColumn(TileColumn.COLUMN_TILE_COLUMN, column);
    fieldValues.addColumn(TileColumn.COLUMN_ZOOM_LEVEL, zoomLevel);
    var iterator = this.queryForFieldValues(fieldValues);
    return {
      [Symbol.iterator]() {
        return this;
      },
      next: () => {
        var nextRow = iterator.next();
        if (!nextRow.done) {
          var tileRow = this.getRow(nextRow.value);
          return {
            value: tileRow,
            done: false
          };
        }
        else {
          return {
            value: undefined,
            done: true
          };
        }
      }
    };
  }
  /**
   * Query for tiles at a zoom level and row
   * @param  {Number} row       row
   * @param  {Number} zoomLevel    zoom level
   */
  queryForTilesInRow(row: number, zoomLevel: number): IterableIterator<TileRow> {
    var fieldValues = new ColumnValues();
    fieldValues.addColumn(TileColumn.COLUMN_TILE_ROW, row);
    fieldValues.addColumn(TileColumn.COLUMN_ZOOM_LEVEL, zoomLevel);
    var iterator = this.queryForFieldValues(fieldValues);
    return {
      [Symbol.iterator]() {
        return this;
      },
      next: () => {
        var nextRow = iterator.next();
        if (!nextRow.done) {
          var tileRow = this.getRow(nextRow.value);
          return {
            value: tileRow,
            done: false
          };
        }
        else {
          return {
            value: undefined,
            done: true
          };
        }
      }
    };
  }
  /**
   * Query by tile grid and zoom level
   * @param  {TileGrid} tileGrid  tile grid
   * @param  {Number} zoomLevel zoom level
   * @returns {IterableIterator<any>}
   */
  queryByTileGrid(tileGrid: TileGrid, zoomLevel: number): IterableIterator<TileRow> {
    if (!tileGrid)
      return;
    var where = '';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_ZOOM_LEVEL, zoomLevel);
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_COLUMN, tileGrid.min_x, '>=');
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_COLUMN, tileGrid.max_x, '<=');
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_ROW, tileGrid.min_y, '>=');
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_ROW, tileGrid.max_y, '<=');
    var whereArgs = this.buildWhereArgs([zoomLevel, tileGrid.min_x, tileGrid.max_x, tileGrid.min_y, tileGrid.max_y]);
    var iterator = this.queryWhereWithArgsDistinct(where, whereArgs);
    return {
      [Symbol.iterator]() {
        return this;
      },
      next: () => {
        var nextRow = iterator.next();
        if (!nextRow.done) {
          var tileRow = this.getRow(nextRow.value);
          return {
            value: tileRow,
            done: false
          };
        }
        else {
          return {
            value: undefined,
            done: true
          };
        }
      }
    };
  }
  /**
   * count by tile grid and zoom level
   * @param  {TileGrid} tileGrid  tile grid
   * @param  {Number} zoomLevel zoom level
   * @returns {Number} count of tiles
   */
  countByTileGrid(tileGrid: TileGrid, zoomLevel: number): number {
    if (!tileGrid)
      return;
    var where = '';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_ZOOM_LEVEL, zoomLevel);
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_COLUMN, tileGrid.min_x, '>=');
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_COLUMN, tileGrid.max_x, '<=');
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_ROW, tileGrid.min_y, '>=');
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_ROW, tileGrid.max_y, '<=');
    var whereArgs = this.buildWhereArgs([zoomLevel, tileGrid.min_x, tileGrid.max_x, tileGrid.min_y, tileGrid.max_y]);
    return this.countWhere(where, whereArgs);
  }

  deleteTile(column: number, row: number, zoomLevel: number): number {
    var where = '';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_ZOOM_LEVEL, zoomLevel);
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_COLUMN, column);
    where += ' and ';
    where += this.buildWhereWithFieldAndValue(TileColumn.COLUMN_TILE_ROW, row);
    var whereArgs = this.buildWhereArgs([zoomLevel, column, row]);
    return this.deleteWhere(where, whereArgs);
  }
  getSrs(): SpatialReferenceSystem {
    return this.geoPackage.getSpatialReferenceSystemDao().getBySrsId(this.tileMatrixSet.srs_id);
  }
  dropTable(): boolean {
    var tileMatrixDao = this.geoPackage.getTileMatrixDao();
    var dropResult = UserDao.prototype.dropTable.call(this);
    var tileMatrixSetDao = this.geoPackage.getTileMatrixSetDao();
    tileMatrixSetDao.delete(this.tileMatrixSet);
    for (var i = this.tileMatrices.length - 1; i >= 0; i--) {
      var tileMatrix = this.tileMatrices[i];
      tileMatrixDao.delete(tileMatrix);
    }
    var dao = this.geoPackage.getContentsDao();
    dao.deleteById(this.gpkgTableName);
    return dropResult;
  }
  rename(newName: string) {
    UserDao.prototype.rename.call(this, newName);
    var oldName = this.tileMatrixSet.table_name;
    var values = {};
    values[TileMatrixSetDao.COLUMN_TABLE_NAME] = newName;
    var where = this.buildWhereWithFieldAndValue(TileMatrixSetDao.COLUMN_TABLE_NAME, oldName);
    var whereArgs = this.buildWhereArgs([oldName]);
    var contentsDao = this.geoPackage.getContentsDao();
    var contents = contentsDao.queryForId(oldName);
    contents.table_name = newName;
    contents.identifier = newName;
    contentsDao.create(contents);
    var tileMatrixSetDao = this.geoPackage.getTileMatrixSetDao();
    tileMatrixSetDao.updateWithValues(values, where, whereArgs);
    var tileMatrixDao = this.geoPackage.getTileMatrixDao();
    var tileMatrixUpdate = {};
    tileMatrixUpdate[TileMatrixDao.COLUMN_TABLE_NAME] = newName;
    var tileMatrixWhere = this.buildWhereWithFieldAndValue(TileMatrixDao.COLUMN_TABLE_NAME, oldName);
    tileMatrixDao.updateWithValues(tileMatrixUpdate, tileMatrixWhere, whereArgs);
    contentsDao.deleteById(oldName);
  }
}