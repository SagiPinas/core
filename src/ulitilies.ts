

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('tempdb.json')

export const tempDB = low(adapter)


export const guid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const getCoordinates = (url) => {
  let coordinates = {}
  var c0 = decodeURIComponent(url).split('https://')[2].split('aspx')[1];
  let cardinals = new URLSearchParams(c0).get('where1').split(',');
  coordinates = {
    lat: cardinals[0],
    long: cardinals[1]
  }
  return coordinates
}




