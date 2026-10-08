-- =====================================================================
-- Ontology extension: the operational digital thread.
--
-- Adds four concrete classes and seven relations so the ontology can answer
-- "which customer orders did this supplier lot reach?" and "what is this
-- tool's exposure?" by traversal rather than by joining tables in the app:
--
--   Asset (abstract) <- Equipment             installedAt   Equipment    -> Plant
--   Transaction (abstract) <- SalesOrder       placedBy      SalesOrder   -> Customer
--   Item (abstract) <- SystemSerial,           fulfilledBy   SalesOrder   -> Plant
--                     ComponentLot             builtAt       SystemSerial -> Plant
--                                              shippedOn     SystemSerial -> SalesOrder
--                                              containsLot   SystemSerial -> ComponentLot
--                                              suppliedBy    ComponentLot -> Supplier
--
-- Instances come from SAP_SUPPLY_CHAIN.ANALYTICS.DT_* (OPS_EXT demo
-- enrichment keyed to SAP master data). Idempotent: deletes what it owns
-- (by NODE_TYPE / EDGE_TYPE / class name) and re-inserts.
-- =====================================================================
USE SCHEMA SAP_SUPPLY_CHAIN.ONTOLOGY;

-- ---------------------------------------------------------------- schema
DELETE FROM ONT_CLASS WHERE CLASS_NAME IN ('Asset','Transaction','Item','Equipment','SalesOrder','SystemSerial','ComponentLot');
INSERT INTO ONT_CLASS (CLASS_NAME, PARENT_CLASS_NAME, IS_ABSTRACT, DESCRIPTION, ONTOLOGY_NAME, TYPE_CLASS, CREATED_AT)
SELECT column1, column2, column3, column4, 'SUPPLY_CHAIN', 'OBJECT', CURRENT_TIMESTAMP() FROM VALUES
  ('Asset',        'Entity',      TRUE,  'A physical production asset with a health state.'),
  ('Equipment',    'Asset',       FALSE, 'A production tool (stepper, etcher, CVD chamber, assembly cell) at a work center.'),
  ('Transaction',  'Entity',      TRUE,  'A business document that commits the supply chain to deliver.'),
  ('SalesOrder',   'Transaction', FALSE, 'A customer order line for an inspection system, with OTIF outcome and late cost.'),
  ('Item',         'Entity',      TRUE,  'A traceable physical unit.'),
  ('SystemSerial', 'Item',        FALSE, 'One built inspection system, identified by serial number.'),
  ('ComponentLot', 'Item',        FALSE, 'A received supplier lot of a BOM component, with inspection result.');

DELETE FROM ONT_RELATION_DEF WHERE REL_NAME IN ('installedAt','placedBy','fulfilledBy','builtAt','shippedOn','containsLot','suppliedBy');
INSERT INTO ONT_RELATION_DEF (REL_NAME, DOMAIN_CLASS, RANGE_CLASS, CARDINALITY, IS_HIERARCHICAL, IS_TRANSITIVE, INVERSE_REL_NAME, DESCRIPTION, ONTOLOGY_NAME)
SELECT column1, column2, column3, column4, FALSE, FALSE, column5, column6, 'SUPPLY_CHAIN' FROM VALUES
  ('installedAt', 'Equipment',    'Plant',        'N:1', 'hasEquipment', 'The plant where a tool is installed.'),
  ('placedBy',    'SalesOrder',   'Customer',     'N:1', 'placed',       'The customer who placed the order.'),
  ('fulfilledBy', 'SalesOrder',   'Plant',        'N:1', 'fulfills',     'The plant that builds and ships the order.'),
  ('builtAt',     'SystemSerial', 'Plant',        'N:1', 'built',        'Where the system was built.'),
  ('shippedOn',   'SystemSerial', 'SalesOrder',   'N:1', 'shipped',      'The order the system shipped against.'),
  ('containsLot', 'SystemSerial', 'ComponentLot', 'N:N', 'usedIn',       'Component lots consumed in the system (genealogy).'),
  ('suppliedBy',  'ComponentLot', 'Supplier',     'N:1', 'suppliedLot',  'The supplier of the lot.');

DELETE FROM ONT_CLASS_MAP WHERE CLASS_NAME IN ('Equipment','SalesOrder','SystemSerial','ComponentLot');
INSERT INTO ONT_CLASS_MAP (MAP_ID, CLASS_NAME, SOURCE_DATABASE, SOURCE_SCHEMA, SOURCE_TABLE, FILTER_COL, FILTER_VAL, ID_EXPR, NAME_EXPR, SUBTYPE_EXPR, ONTOLOGY_NAME)
SELECT 'map_'||LOWER(column1), column1, 'SAP_SUPPLY_CHAIN', 'ONTOLOGY', 'KG_NODE', 'NODE_TYPE', column1, 'NODE_ID', 'NAME', NULL, 'SUPPLY_CHAIN'
FROM VALUES ('Equipment'), ('SalesOrder'), ('SystemSerial'), ('ComponentLot');

DELETE FROM ONT_REL_MAP WHERE REL_NAME IN ('installedAt','placedBy','fulfilledBy','builtAt','shippedOn','containsLot','suppliedBy');
INSERT INTO ONT_REL_MAP (MAP_ID, REL_NAME, SOURCE_DATABASE, SOURCE_SCHEMA, SOURCE_TABLE, SRC_ID_EXPR, DST_ID_EXPR, FILTER_COL, FILTER_VAL, ONTOLOGY_NAME)
SELECT 'rmap_'||LOWER(column1), column1, 'SAP_SUPPLY_CHAIN', 'ONTOLOGY', 'KG_EDGE', 'SRC_ID', 'DST_ID', 'EDGE_TYPE', column1, 'SUPPLY_CHAIN'
FROM VALUES ('installedAt'), ('placedBy'), ('fulfilledBy'), ('builtAt'), ('shippedOn'), ('containsLot'), ('suppliedBy');

-- Class nodes + subClassOf edges in the graph itself.
DELETE FROM KG_NODE WHERE NODE_TYPE = 'OntologyClass' AND NAME IN ('Asset','Transaction','Item','Equipment','SalesOrder','SystemSerial','ComponentLot');
INSERT INTO KG_NODE (NODE_ID, NODE_TYPE, NAME, PROPS, TS_INGESTED)
SELECT 'class:'||CLASS_NAME, 'OntologyClass', CLASS_NAME,
       OBJECT_CONSTRUCT('description', DESCRIPTION, 'is_abstract', IS_ABSTRACT, 'parent', PARENT_CLASS_NAME), CURRENT_TIMESTAMP()
FROM ONT_CLASS WHERE CLASS_NAME IN ('Asset','Transaction','Item','Equipment','SalesOrder','SystemSerial','ComponentLot');
DELETE FROM KG_EDGE WHERE EDGE_TYPE = 'subClassOf' AND SRC_ID IN ('class:Asset','class:Transaction','class:Item','class:Equipment','class:SalesOrder','class:SystemSerial','class:ComponentLot');
INSERT INTO KG_EDGE (EDGE_ID, SRC_ID, DST_ID, EDGE_TYPE, WEIGHT, PROPS, TS_INGESTED)
SELECT 'sub:'||CLASS_NAME, 'class:'||CLASS_NAME, 'class:'||PARENT_CLASS_NAME, 'subClassOf', 1, NULL, CURRENT_TIMESTAMP()
FROM ONT_CLASS WHERE CLASS_NAME IN ('Asset','Transaction','Item','Equipment','SalesOrder','SystemSerial','ComponentLot');

-- ---------------------------------------------------------------- instances
DELETE FROM KG_NODE WHERE NODE_TYPE IN ('Equipment','SalesOrder','SystemSerial','ComponentLot');
DELETE FROM KG_EDGE WHERE EDGE_TYPE IN ('installedAt','placedBy','fulfilledBy','builtAt','shippedOn','containsLot','suppliedBy');

INSERT INTO KG_NODE (NODE_ID, NODE_TYPE, NAME, PROPS, TS_INGESTED)
SELECT 'EQ:'||EQUIPMENT_ID, 'Equipment', EQUIPMENT_NAME,
       OBJECT_CONSTRUCT('EQUIPMENT_TYPE', EQUIPMENT_TYPE, 'WORK_CENTER', WORK_CENTER_DESC, 'PLANT', PLANT, 'CRITICALITY', CRITICALITY,
                        'FAILURE_PROB_48H', FAILURE_PROB_48H, 'ANOMALY_FLAG', ANOMALY_FLAG, 'VIBRATION_MM_S', VIBRATION_MM_S,
                        'READING_DATE', READING_DATE), CURRENT_TIMESTAMP()
FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_EQUIPMENT_HEALTH
QUALIFY ROW_NUMBER() OVER (PARTITION BY EQUIPMENT_ID ORDER BY READING_DATE DESC) = 1;

INSERT INTO KG_NODE (NODE_ID, NODE_TYPE, NAME, PROPS, TS_INGESTED)
SELECT 'SO:'||SALES_ORDER, 'SalesOrder', SALES_ORDER,
       OBJECT_CONSTRUCT('SOLD_TO', SOLD_TO, 'MATERIAL_DESC', MATERIAL_DESC, 'PLANT', PLANT, 'NET_VALUE_USD', NET_VALUE_USD,
                        'REQUESTED_SHIP_DATE', REQUESTED_SHIP_DATE, 'ACTUAL_SHIP_DATE', ACTUAL_SHIP_DATE, 'OTIF', OTIF,
                        'DELAY_DAYS', DELAY_DAYS, 'LATE_CAUSE', LATE_CAUSE_LABEL, 'LATE_COST_USD', LATE_COST_USD,
                        'ORDER_STATUS', ORDER_STATUS), CURRENT_TIMESTAMP()
FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_ORDER_FULFILLMENT;

INSERT INTO KG_NODE (NODE_ID, NODE_TYPE, NAME, PROPS, TS_INGESTED)
SELECT 'SN:'||SERIAL_NO, 'SystemSerial', SERIAL_NO,
       OBJECT_CONSTRUCT('MATERIAL', ANY_VALUE(MATERIAL), 'PLANT', ANY_VALUE(PLANT), 'FINAL_TEST_RESULT', ANY_VALUE(FINAL_TEST_RESULT),
                        'DEFECT_CODE', ANY_VALUE(DEFECT_CODE), 'REWORK_HRS', ANY_VALUE(REWORK_HRS)), CURRENT_TIMESTAMP()
FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_SERIAL_GENEALOGY GROUP BY SERIAL_NO;

INSERT INTO KG_NODE (NODE_ID, NODE_TYPE, NAME, PROPS, TS_INGESTED)
SELECT 'LOT:'||LOT_ID, 'ComponentLot', LOT_ID,
       OBJECT_CONSTRUCT('COMPONENT', COMPONENT_DESC, 'SUPPLIER', SUPPLIER_NAME, 'RECEIVED_DATE', RECEIVED_DATE,
                        'INSPECTION_RESULT', INSPECTION_RESULT, 'DEVIATION_NOTE', DEVIATION_NOTE, 'QTY', QTY,
                        'SUPPLIER_SOURCE', SUPPLIER_SOURCE), CURRENT_TIMESTAMP()
FROM SAP_SUPPLY_CHAIN.OPS_EXT.A_COMPONENT_LOT;

-- Edges. Plant ids are PLT-<plant>; supplier ids match SAP (SUP-00n); customers join by name.
INSERT INTO KG_EDGE (EDGE_ID, SRC_ID, DST_ID, EDGE_TYPE, WEIGHT, PROPS, TS_INGESTED)
SELECT 'inst:'||EQUIPMENT_ID, 'EQ:'||EQUIPMENT_ID, 'PLT-'||PLANT, 'installedAt', 1, NULL, CURRENT_TIMESTAMP()
FROM (SELECT DISTINCT EQUIPMENT_ID, PLANT FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_EQUIPMENT_HEALTH)
UNION ALL
SELECT 'plc:'||o.SALES_ORDER, 'SO:'||o.SALES_ORDER, c.NODE_ID, 'placedBy', o.NET_VALUE_USD, NULL, CURRENT_TIMESTAMP()
FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_ORDER_FULFILLMENT o
JOIN KG_NODE c ON c.NODE_TYPE = 'Customer' AND c.NAME = o.SOLD_TO
UNION ALL
SELECT 'ful:'||SALES_ORDER, 'SO:'||SALES_ORDER, 'PLT-'||PLANT, 'fulfilledBy', NET_VALUE_USD, NULL, CURRENT_TIMESTAMP()
FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_ORDER_FULFILLMENT
UNION ALL
SELECT 'blt:'||SERIAL_NO, 'SN:'||SERIAL_NO, 'PLT-'||ANY_VALUE(PLANT), 'builtAt', 1, NULL, CURRENT_TIMESTAMP()
FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_SERIAL_GENEALOGY GROUP BY SERIAL_NO
UNION ALL
SELECT 'shp:'||SERIAL_NO, 'SN:'||SERIAL_NO, 'SO:'||ANY_VALUE(SALES_ORDER), 'shippedOn', 1, NULL, CURRENT_TIMESTAMP()
FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_SERIAL_GENEALOGY GROUP BY SERIAL_NO
UNION ALL
SELECT 'lot:'||SERIAL_NO||':'||LOT_ID, 'SN:'||SERIAL_NO, 'LOT:'||LOT_ID, 'containsLot', 1, NULL, CURRENT_TIMESTAMP()
FROM (SELECT DISTINCT SERIAL_NO, LOT_ID FROM SAP_SUPPLY_CHAIN.ANALYTICS.DT_SERIAL_GENEALOGY)
UNION ALL
SELECT 'sup:'||LOT_ID, 'LOT:'||LOT_ID, SUPPLIER, 'suppliedBy', 1, NULL, CURRENT_TIMESTAMP()
FROM SAP_SUPPLY_CHAIN.OPS_EXT.A_COMPONENT_LOT;

-- ---------------------------------------------------------------- abstract views
CREATE OR REPLACE VIEW VW_ONT_EQUIPMENT AS
  SELECT NODE_ID, NAME, PROPS FROM KG_NODE WHERE NODE_TYPE = 'Equipment';
CREATE OR REPLACE VIEW VW_ONT_SALESORDER AS
  SELECT NODE_ID, NAME, PROPS FROM KG_NODE WHERE NODE_TYPE = 'SalesOrder';
CREATE OR REPLACE VIEW VW_ONT_SYSTEMSERIAL AS
  SELECT NODE_ID, NAME, PROPS FROM KG_NODE WHERE NODE_TYPE = 'SystemSerial';
CREATE OR REPLACE VIEW VW_ONT_COMPONENTLOT AS
  SELECT NODE_ID, NAME, PROPS FROM KG_NODE WHERE NODE_TYPE = 'ComponentLot';

-- Forward trace: supplier lot -> systems -> orders -> customers (blast radius of a bad lot).
CREATE OR REPLACE VIEW VW_ONT_LOT_BLAST_RADIUS AS
SELECT lot.NAME AS LOT_ID, lot.PROPS:COMPONENT::STRING AS COMPONENT, lot.PROPS:SUPPLIER::STRING AS SUPPLIER,
       lot.PROPS:INSPECTION_RESULT::STRING AS INSPECTION_RESULT,
       sn.NAME AS SERIAL_NO, sn.PROPS:FINAL_TEST_RESULT::STRING AS FINAL_TEST_RESULT,
       so.NAME AS SALES_ORDER, so.PROPS:SOLD_TO::STRING AS CUSTOMER, so.PROPS:NET_VALUE_USD::NUMBER AS ORDER_VALUE_USD
FROM KG_NODE lot
JOIN KG_EDGE c ON c.DST_ID = lot.NODE_ID AND c.EDGE_TYPE = 'containsLot'
JOIN KG_NODE sn ON sn.NODE_ID = c.SRC_ID
JOIN KG_EDGE s ON s.SRC_ID = sn.NODE_ID AND s.EDGE_TYPE = 'shippedOn'
JOIN KG_NODE so ON so.NODE_ID = s.DST_ID
WHERE lot.NODE_TYPE = 'ComponentLot';
