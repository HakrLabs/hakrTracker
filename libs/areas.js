var pg = require('pg'),
    async = require('async'),
    config = require('./config.js'),
    uniqueItems = require('./unique_items'),
    redis = require('redis');

// Create a Redis Client
var redisClient = redis.createClient();

// Display Redis Errors if any arise
redisClient.on('error', function(err){
    console.error('Redis Error: ', err)
})

// Create PG Connection String and Client
var pgConn = "postgres://" + config.postgres.user + ":" + config.postgres.password + "@" + config.postgres.host + "/" + config.postgres.database;
var pgClient = new pg.Client(pgConn);

// Connect to Postgres Database
pgClient.connect(function(err) {
    if(err) {
        console.log('Could not connect to postgres', err); 
    } else {
        console.log('Connect to Hacker Tracker');
    }
});

/**
 * Function for Querying Postgres and Retrieving Area Data
 * @function queryPostgresForAreas
 * @param {string} query - Query String for Postgres
 * @param {object} pgClient - pgClient object
 * @param {object} res - expressJS response object
 * @callback {function} callback function for sending area(s) response
 *
 */
var queryPostgresForAreas = function(query, pgClient, res, callback) {
    pgClient.query(query, function(err, areas) {
        if(err) {
            res.send({error: 1, errMsg: 'Error Querying Hacker Tracker ' + err})
            return console.error('Error Querying Hacker Tracker', err);
        }

        var allAreas = areas.rows;
        uniqueItems.getUniqueItems(pgClient, res, allAreas, function(fullAreaInfo) {
            var areas_with_items = {};
            areas_with_items.areas = fullAreaInfo;
            if(typeof callback === "function") {
                callback(areas_with_items);
            }
        });
    });
}

/**
 * A function for taking sending JSON objects to the requesting client
 * @function respondToClient
 * @param {object} res - expressJS response object
 * @param {object} options - options to decide type of response and jsonp
 * callback
 * @param {object} responseObject - Object being sent to client via res
 */
var respondToClient = function(res, options, responseObject){
    if(typeof options.format != "undefined" || options.format != null) {
        res.send(responseObject);
    } else {
        res.send(callback + '(' + JSON.stringify(responseObject) + ')');
    }
}

/**
 * Retreives all Areas, Items and Tickets
 * @function findAll
 * @param {object} req - expressJS request object
 * @param {object} res - expressJS response object
 */
var findAll = function(req, res) {
    var responseOptions = {};
    responseOptions.callback = req.query.callback;
    responseOptions.format = req.query.format;

    redisClient.get("areas.all", function(err, reply){
        if(err) {
            console.error('Redis Error: ', err);
        } else if(reply === null) {
            var pgQueryFindAll = "SELECT * FROM areas";
            queryPostgresForAreas(pgQueryFindAll, pgClient, res, function(allAreas){
                redisClient.set("areas.all", JSON.stringify(allAreas));
                console.log('Updated Redis and Used Postgres Response');
                respondToClient(res, responseOptions, allAreas);
            });
        } else {
            console.log('Using Redis Response');
            respondToClient(res, responseOptions, JSON.parse(allAreas));
        }
    });
}
/**
 * Retreives Area, Items and Tickets by Id
 */
var getById = function(req, res) {
    var responseOptions = {};
    responseOptions.callback = req.query.callback;
    responseOptions.format = req.query.format;
    
    var id = req.route.params.id;
    
    redisClient.get("areas." + id, function(err, reply){
        if(err) {
            console.error('Redis Error: ', err);
        } else if(reply === null) {
            var pgQueryFindById = "SELECT * from areas WHERE id='"  + id + "'";
            queryPostgresForAreas(pgQueryFindById, pgClient, res, function(area){
                redisClient.set("areas." + id, JSON.stringify(area));
                respondToClient(res, responseOptions, area);
            });
        } else {
            respondToClient(res, responseOptions, JSON.parse(reply));
        }
    });
}

module.exports = 
    { findAll: findAll
    , getById: getById
    };