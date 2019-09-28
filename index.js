var csv = require( 'csv-parser')
var fs = require( 'fs')
var tf = require('@tensorflow/tfjs-node');

var express = require("express");
var http = require("http")
var bodyParser = require("body-parser");
var cors = require("cors")

var GenerationOfSensorDataModel = require('./GenerationOfSensorDataModel')

function roughSizeOfObject( object ) {

    var objectList = [];

    var recurse = function( value )
    {
        var bytes = 0;

        if ( typeof value === 'boolean' ) {
            bytes = 4;
        }
        else if ( typeof value === 'string' ) {
            bytes = value.length * 2;
        }
        else if ( typeof value === 'number' ) {
            bytes = 8;
        }
        else if
        (
            typeof value === 'object'
            && objectList.indexOf( value ) === -1
        )
        {
            objectList[ objectList.length ] = value;

            for( i in value ) {
                bytes+= 8; // an assumed existence overhead
                bytes+= recurse( value[i] )
            }
        }

        return bytes;
    }

    return recurse( object );
}

const DATA_PATH = './data/cpu_temp_hist.csv'
//const DATA_PATH = './data/weather_max_temp.csv'

let dataframe = [];
let xs, ys;
let t;

fs.createReadStream(DATA_PATH)
  .pipe(csv())
  .on('data', (row) => {
    console.log(row)
    dataframe.push([(new Date(row.datetime).getTime())/(1000*60*10), parseFloat(row[' temperature']).toFixed(1) ])
    //dataframe.push([parseInt(row.index), parseFloat(row['max_temp']).toFixed(1) ])
  })
  .on('end', () => {
    console.log('CSV file successfully processed');

    dataframe = dataframe.map(r=>[r[0], parseFloat(r[1])])
    xs = dataframe.map(r=>r[0])
    ys = dataframe.map(r=>parseFloat(r[1]));



  });



  var app = express();
  const server = http.createServer(app);

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(cors())
  app.get('/data', (req,res)=>{
    res.send({
      dataframe,
      xs,
      ys
    })
  })
  app.get('/genmodels/:socketId', (req,res)=>{
    console.log("GENMODELS:")
    console.log(req.body)
    console.log(req.params)
    var models = GenerationOfSensorDataModel([xs,ys], MAX_DEGREE, req.body.data.maxError);
    console.log("MODELS:")
    console.log(models)
    var sizeOriginal = roughSizeOfObject([xs,ys])
    var sizeModels = roughSizeOfObject(models)
    var compression = parseFloat(100*(sizeOriginal-sizeModels)/sizeOriginal).toFixed(1);
    console.log(`moappdel achieved %${compression} `)

    res.send({models})
  })

  //SOCKET SETUP
  const sio = require("socket.io")(server, {
    origins: '*:*',
    transports: ['websocket', 'htmlfile', 'xhr-polling', 'jsonp-polling', 'polling'],
    handlePreflightRequest: (req, res) => {
        const headers = {
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Origin": "*:*", //or the specific origin you want to give access to,
            "Access-Control-Allow-Credentials": true
        };
        res.writeHead(200, headers);
        res.end();
        }
  });

  sio.on("connection", (c) => {
      console.log("Connected!");

      c.on("request", (data)=> {
        console.log("socket request:")
        console.log(data)
        switch(data.type){
          case "run-model":
            console.log("GENMODELS:")
            var models = GenerationOfSensorDataModel([xs,ys], data.data.maxDegree, data.data.maxError, c);
            console.log("MODELS:")
            console.log(models)
            var sizeOriginal = roughSizeOfObject([xs,ys])
            var sizeModels = roughSizeOfObject(models)
            var compression = parseFloat(100*(sizeOriginal-sizeModels)/sizeOriginal).toFixed(1);
            console.log(`moappdel achieved %${compression} `)
            c.emit('event', {
              type:'set-models',
              data: {
                models,
                compression
              }
            })
            break;
          default:
            console.log("UNHANDLED SOCKET REQUEST: " + data.type)
            break;
        }
      })
  });


  server.listen(3030, function () {
      console.log("app running on port.", server.address().port);
  });
