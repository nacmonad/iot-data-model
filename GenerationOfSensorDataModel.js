var tf = require('@tensorflow/tfjs-node');
var PolynomialRegression = require('ml-regression-polynomial');

// const learningRate = 0.5;
// const optimizer = tf.train.sgd(learningRate);

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


const model = ([xs,ys], maximumDegree, GAMMA, socket_connection)=>{
  const models = [];

  const executePolyfit = async (l, h, deg) => {
      //console.log(`execute degree ${deg} polyfit: ${l} to ${h}`)

      try {
        let regression = new PolynomialRegression(xs.slice(l,h),ys.slice(l,h), deg);
        let p = regression.coefficients;

        for(var j = l; j < h; j++) {
          let predictedValue = regression.predict(xs[j]);
          let absoluteError = Math.abs(predictedValue-ys[j]);
          //console.log(`predicted: ${predictedValue} actual:${ys[j]} absErr:${absoluteError}`)
          // socket_connection.emit('event', {
          //   type: 'estimation',
          //   data: {
          //     index: j,
          //     low:l,
          //     high:h,
          //     poly: p,
          //     predicted:predictedValue,
          //     actual: ys[j],
          //     absError: absoluteError
          //   }
          // })
          ////await timeout(50)
          if(h-l <= 1) {
            socket_connection.emit('event', {
              type: 'add-poly',
              data: [[l,h],ys[l]]
            })
            models.push([[l,h],ys[l]]) //just a point in this case
            ////await timeout(1000)
            return;
          }
          if(deg > maximumDegree) {
            let m = Math.round(l + (h-l)/2);
            executePolyfit(l,m,1);
            executePolyfit(m,h,1);
            return;
          }
          if(absoluteError > GAMMA) {
            executePolyfit(l,h, deg+1);
            return;
          }
        }

        //another compression -~1%
        if(p.length === 2 && p[1] === 0) {
          //console.log("SUBZERO")
          socket_connection.emit('event', {
            type: 'add-poly',
            data: [[l,h],p[0]]
          })
          models.push([[l,h], p[0]])
          //await timeout(1000)
        } else {
            socket_connection.emit('event', {
              type: 'add-poly',
              data: [[l,h],...p]
            })
            models.push([[l,h],...p])
            //await timeout(1000)
        }

      } catch (e) {
        //console.log(e)   ignors LU error in ml-matrix library
        if(h-l <= 1) {
          socket_connection.emit('event', {
            type: 'add-poly',
            data: [[l,h],ys[l]]
          })
          models.push([l, ys[l]]) //implied to just be x,y point
          //await timeout(1000)
          return;
        }
        if(deg > maximumDegree) {
          let m = Math.round(l + (h-l)/2);
          executePolyfit(l,m,1);
          executePolyfit(m,h,1);
        } else {
          executePolyfit(l,h, deg+1);
        }
        return;
      }
      return 1;
  }


  console.log("processing max degree, gama " + maximumDegree + ', ' + GAMMA)

  let degree = 1;
  let low = 0;
  let high = xs.length;

  executePolyfit(low,high-1,degree);
  return models;
}



module.exports = model;
