<?xml version="1.0" encoding="UTF-8"?>
<!--
  Fixture de test écrite à la main pour lib/citygml.mjs.

  Elle n'imite PAS le générateur d'échantillon (make-sample.mjs) : elle
  exerce au contraire tout ce qu'il ne produit pas, et qu'un vrai CityGML
  PLATEAU contient :
    · des préfixes d'espaces de noms NON conventionnels (bld:, g:) ;
    · un srsName en URN (urn:ogc:def:crs:EPSG::6697) ;
    · un bâtiment LOD2 dont les polygones vivent dans bldg:boundedBy
      (WallSurface / RoofSurface / GroundSurface), pas dans un lodXSolid ;
    · un bâtiment LOD1 avec un anneau intérieur (gml:interior) ;
    · un bâtiment porteur de bldg:BuildingPart ;
    · un polygone décrit par une suite de gml:pos au lieu d'un gml:posList ;
    · un bâtiment sans aucune géométrie exploitable.

  Coordonnées : EPSG:6697, ordre (latitude longitude hauteur), près de Sugamo.
-->
<CityModel
    xmlns="http://www.opengis.net/citygml/2.0"
    xmlns:bld="http://www.opengis.net/citygml/building/2.0"
    xmlns:g="http://www.opengis.net/gml"
    xmlns:xlink="http://www.w3.org/1999/xlink">
  <g:boundedBy>
    <g:Envelope srsName="urn:ogc:def:crs:EPSG::6697" srsDimension="3">
      <g:lowerCorner>35.7330 139.7380 60.0</g:lowerCorner>
      <g:upperCorner>35.7340 139.7400 90.0</g:upperCorner>
    </g:Envelope>
  </g:boundedBy>

  <!-- 1. LOD2 : surfaces portées par bldg:boundedBy. -->
  <cityObjectMember>
    <bld:Building g:id="BLD_LOD2">
      <bld:measuredHeight uom="m">12.5</bld:measuredHeight>
      <bld:class>3001</bld:class>
      <bld:usage>411</bld:usage>
      <bld:lod2Solid>
        <g:Solid>
          <g:exterior>
            <g:CompositeSurface>
              <g:surfaceMember xlink:href="#poly-wall-1"/>
              <g:surfaceMember xlink:href="#poly-roof-1"/>
            </g:CompositeSurface>
          </g:exterior>
        </g:Solid>
      </bld:lod2Solid>
      <bld:boundedBy>
        <bld:WallSurface g:id="WALL_1">
          <bld:lod2MultiSurface>
            <g:MultiSurface>
              <g:surfaceMember>
                <g:Polygon g:id="poly-wall-1">
                  <g:exterior>
                    <g:LinearRing>
                      <g:posList srsDimension="3">35.7331 139.7381 65.0 35.7331 139.7383 65.0 35.7331 139.7383 77.5 35.7331 139.7381 77.5 35.7331 139.7381 65.0</g:posList>
                    </g:LinearRing>
                  </g:exterior>
                </g:Polygon>
              </g:surfaceMember>
            </g:MultiSurface>
          </bld:lod2MultiSurface>
        </bld:WallSurface>
      </bld:boundedBy>
      <bld:boundedBy>
        <bld:RoofSurface g:id="ROOF_1">
          <bld:lod2MultiSurface>
            <g:MultiSurface>
              <g:surfaceMember>
                <g:Polygon g:id="poly-roof-1">
                  <g:exterior>
                    <g:LinearRing>
                      <!-- Décrit en gml:pos plutôt qu'en gml:posList. -->
                      <g:pos>35.7331 139.7381 77.5</g:pos>
                      <g:pos>35.7331 139.7383 77.5</g:pos>
                      <g:pos>35.7332 139.7383 77.5</g:pos>
                      <g:pos>35.7332 139.7381 77.5</g:pos>
                      <g:pos>35.7331 139.7381 77.5</g:pos>
                    </g:LinearRing>
                  </g:exterior>
                </g:Polygon>
              </g:surfaceMember>
            </g:MultiSurface>
          </bld:lod2MultiSurface>
        </bld:RoofSurface>
      </bld:boundedBy>
    </bld:Building>
  </cityObjectMember>

  <!-- 2. LOD1 avec un anneau intérieur (patio). -->
  <cityObjectMember>
    <bld:Building g:id="BLD_LOD1_HOLE">
      <bld:measuredHeight uom="m">8.0</bld:measuredHeight>
      <bld:lod1Solid>
        <g:Solid>
          <g:exterior>
            <g:CompositeSurface>
              <g:surfaceMember>
                <g:Polygon>
                  <g:exterior>
                    <g:LinearRing>
                      <g:posList>35.7335 139.7390 67.0 35.7335 139.7394 67.0 35.7338 139.7394 67.0 35.7338 139.7390 67.0 35.7335 139.7390 67.0</g:posList>
                    </g:LinearRing>
                  </g:exterior>
                  <g:interior>
                    <g:LinearRing>
                      <g:posList>35.7336 139.7391 67.0 35.7337 139.7391 67.0 35.7337 139.7393 67.0 35.7336 139.7393 67.0 35.7336 139.7391 67.0</g:posList>
                    </g:LinearRing>
                  </g:interior>
                </g:Polygon>
              </g:surfaceMember>
            </g:CompositeSurface>
          </g:exterior>
        </g:Solid>
      </bld:lod1Solid>
    </bld:Building>
  </cityObjectMember>

  <!-- 3. Bâtiment porteur d'une BuildingPart : la géométrie est dans la partie. -->
  <cityObjectMember>
    <bld:Building g:id="BLD_WITH_PART">
      <bld:consistsOfBuildingPart>
        <bld:BuildingPart g:id="PART_A">
          <bld:measuredHeight uom="m">5.0</bld:measuredHeight>
          <bld:lod1Solid>
            <g:Solid>
              <g:exterior>
                <g:CompositeSurface>
                  <g:surfaceMember>
                    <g:Polygon>
                      <g:exterior>
                        <g:LinearRing>
                          <g:posList>35.7333 139.7396 66.0 35.7333 139.7398 66.0 35.7334 139.7398 66.0 35.7334 139.7396 66.0 35.7333 139.7396 66.0</g:posList>
                        </g:LinearRing>
                      </g:exterior>
                    </g:Polygon>
                  </g:surfaceMember>
                </g:CompositeSurface>
              </g:exterior>
            </g:Solid>
          </bld:lod1Solid>
        </bld:BuildingPart>
      </bld:consistsOfBuildingPart>
    </bld:Building>
  </cityObjectMember>

  <!-- 4. Bâtiment sans géométrie exploitable (attributs seuls). -->
  <cityObjectMember>
    <bld:Building g:id="BLD_NO_GEOMETRY">
      <bld:measuredHeight uom="m">3.0</bld:measuredHeight>
    </bld:Building>
  </cityObjectMember>
</CityModel>
