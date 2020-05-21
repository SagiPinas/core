const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')
const request = require('request');
const axios = require('axios');
const bcrypt = require('bcrypt');

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

import moment from 'moment'

require('dotenv').config();

io.set('origins', '*:*');

let port = process.env.PORT || 7000;

app.use(express.static('views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors())
http.listen(port);

console.log(`===============================`)
console.log(`SagiPinas Core API ${port}`)
console.log(`===============================`)

const googleMapsAPIKEY = "AIzaSyD5kFZMwUIUDZ25nTtLx0_0G3x1d2GMiCY";

let evacuees = [];
let reportees = [];

import msg from './messages';
import { guid, tempDB, getCoordinates } from './ulitilies';
import db from './db';

app.get("/", (req, res) => {
  res.send({
    message: "SagiPinas Core v. 1.0",
    status: "running"
  })
})

app.get('/test', async (req, res) => {
  try {
    const client = await db.connect()
    const result = await client.query('SELECT * FROM users');
    const results = { 'results': (result) ? result.rows : null };
    res.send(results);
    client.release();
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
})

app.get("/incidents", (req, res) => {
  res.send(tempDB.get("incidents").value().reverse())
})

app.get("/events", (req, res) => {


  axios.get(`https://api.covid19api.com/country/philippines`)
    .then(result => {

      let phData = result.data[result.data.length - 1];

      let countryStatus = {
        "title": `[Philippines] ${phData.Recovered} Recovered, ${phData.Deaths} Deaths, ${phData.Active} Active cases`,
        "image_url": "https://blc.edu/wp-content/uploads/2020/03/COVID19-graphic-with-text-FEATURED-IMAGE.jpg",
        "subtitle": `As of ${moment(phData.Date).format('MMMM D, YYYY')} latest updates.`
      }

      res.send([countryStatus])
    })

})

app.post("/login", (req, res) => {

  let email = req.body.email;
  let password = req.body.password;

  if (!email || !password) {
    res.send({
      status: "error",
      message: "Incomplete Data Provided"
    })
  } else {

    let userInstance = tempDB.get("users").find({ email: email }).value();

    if (userInstance) {
      let hash = userInstance.password;
      bcrypt.compare(password, hash, (err, passwordTest) => {
        if (!passwordTest) {
          res.send({
            status: "failed",
            message: "Invalid Credentials"
          })
        } else {
          res.send({
            status: "success",
            message: "Successful log in.",
            userData: {
              id: userInstance.id,
              name: userInstance.name,
              city: userInstance.city,
              avatar: userInstance.avatar,
              status: userInstance.status
            }
          })
        }

      });
    } else {
      res.send({
        status: "failed",
        message: "User not found."
      })
    }
  }
})

app.post("/signup", (req, res) => {
  if (req.body.email && req.body.password
    && req.body.name && req.body.city
  ) {
    let userInstance = tempDB.get("users").find({ email: req.body.email }).value();
    if (userInstance) {
      res.send({
        status: "failed",
        message: "The email address you provided is already taken."
      })
    } else {
      bcrypt.hash(req.body.password.trim(), 10, (err, hash) => {
        let newId = guid()
        let newUser = {
          id: newId,
          email: req.body.email.trim(),
          password: hash,
          name: req.body.name,
          city: req.body.city,
          avatar: req.body.avatar,
          status: "active"
        }

        tempDB.get("users").value().push(newUser);
        tempDB.write();

        res.send({
          status: "success",
          userId: newId,
          message: "Account created successfully"
        })
      })
    }
  } else {
    res.send({
      status: "error",
      message: "Incomplete Data Provided."
    })
  }
})

app.get("/public/responder", (req, res) => {
  if (req.query.responderId) {
    let responderInstance = tempDB.get("users").find({ id: req.query.responderId }).value();
    let cancelledReports = tempDB.get("incidents").filter({ status: "cancelled" }).value();
    let responderHistory = tempDB.get("incidents").filter({ responder: req.query.responderId }).value();

    if (responderInstance) {


      let responseData = {
        status: "success",
        profile: {
          id: responderInstance.id,
          name: responderInstance.name,
          email: responderInstance.email,
          city: responderInstance.city
        },
        history: [...responderHistory, ...cancelledReports]
      }

      res.send(responseData)
    } else {
      res.send({
        status: "error",
        message: "Responder not found."
      })
    }

  } else {
    res.send({
      status: "error",
      message: "Incomplete data provided."
    })
  }
})

// Messenger chatbot endpoints

app.get('/webhook', (req, res) => {
  console.log("[GET] Webhook endpoint hit!")
  let VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_KEY;
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED [GET]');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post('/webhook', (req, res) => {

  let body = req.body;
  console.log("[POST] Webhook endpoint hit!")
  if (body.object === 'page') {

    body.entry.forEach(function (entry) {


      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id;

      // if referral is ever needed

      // if (entry.messaging[0].referral) {
      //   handleReferral(sender_psid, entry.messaging[0].referral.ref)
      // }

      io.emit('activity');

      if (webhook_event.message) {
        handleMessage(
          sender_psid,
          webhook_event.message,
          webhook_event.message.attachments
        );
      } else if (webhook_event.postback) {
        handlePostback(sender_psid, webhook_event.postback);
      }
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

const textResponse = (text) => {
  return {
    "text": text
  }
}

const defaultActions = () => {
  return {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": msg.welcomeGreeting,
        "buttons": [
          {
            "type": "postback",
            "title": "Report an Incident",
            "payload": "report_incident"
          },
          {
            "type": "postback",
            "title": "View Recent Events",
            "payload": "recent_events",
          },
          {
            "type": "postback",
            "title": "Evacuation Areas",
            "payload": "evacuate",
          }
        ]
      }
    }
  }
}

const sendMessage = (sender_psid, response, cb = null) => {

  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  };

  request({
    "uri": "https://graph.facebook.com/v3.3/me/messages",
    "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      if (cb) {
        cb();
      }
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}


const cancelReport = (uid) => {
  if (reportees) {
    if (reportees[uid]) {
      sendMessage(uid, msg.cancelReport);

      let reportInstance = tempDB.get('incidents').find({ uid: reportees[uid].uid }).value()

      if (reportInstance) {
        reportInstance.status = "cancelled";
        tempDB.write()
      }

      delete reportees[uid];

    }
  }
}

const watchCommands = (messageText, userId) => {
  if (messageText) {
    let command = messageText.toLowerCase()
    switch (command) {
      case "cancel:report":
        cancelReport(userId)
        break;
    }
  }
}


const sendRecentEvents = (sender) => {

  axios.get(`https://api.covid19api.com/country/philippines`)
    .then(result => {

      let phData = result.data[result.data.length - 1];


      let events = {
        "attachment": {
          "type": "template",
          "payload": {
            "template_type": "generic",
            "elements": [
              {
                "title": `[Philippines] ${phData.Recovered} Recovered, ${phData.Deaths} Deaths, ${phData.Active} Active cases`,
                "image_url": "https://blc.edu/wp-content/uploads/2020/03/COVID19-graphic-with-text-FEATURED-IMAGE.jpg",
                "subtitle": `As of ${moment(phData.Date).format('MMMM D, YYYY')} latest updates.`
              }
            ]
          }
        }
      }
      sendMessage(sender, events)

    })

}


const askForLocation = (sender) => {

  let options = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": msg.askLocation,
        "buttons": [
          {
            "type": "postback",
            "title": "Cancel",
            "payload": "cancel_evacuation"
          }
        ]
      }
    }
  }

  sendMessage(sender, options)
}

const getLocation = (sender) => {

  let options = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": msg.getLocation,
        "buttons": [
          {
            "type": "postback",
            "title": "Cancel",
            "payload": "cancel_report"
          }
        ]
      }
    }
  }

  sendMessage(sender, options)
}


const askforCompletetion = (sender) => {

  let options = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": msg.incompleteReport,
        "buttons": [
          {
            "type": "postback",
            "title": "Cancel Report",
            "payload": "cancel_report"
          }
        ]
      }
    }
  }

  sendMessage(sender, options)
}


const getAreas = (sender, location) => {
  axios.get(`https://maps.googleapis.com/maps/api/place/nearbysearch/json`, {
    params: {
      location: `${location.lat},${location.long}`,
      rankby: "distance",
      type: "establishment",
      keyword: "hospital,school",
      key: googleMapsAPIKEY
    }
  })
    .then(res => {
      if (res.data.results.length > 0) {

        sendMessage(sender, {
          "text": msg.nearbyEvacuation
        })


        let AreaList = {
          "attachment": {
            "type": "template",
            "payload": {
              "template_type": "generic",
              "elements": res.data.results.map(area => {
                return {
                  title: area.name,
                  image_url: area.icon,
                  subtitle: area.vicinity
                }
              }).slice(0, 9)
            }
          }
        }
        sendMessage(sender, AreaList);

      } else {
        sendMessage(sender, {
          "text": msg.noAreas
        })
      }
      evacuees.splice(evacuees.indexOf(sender), 1)
    }).catch(err => {
      console.log(err)
    })
}


const getEvacuationAreas = (sender) => {
  let message = {
    "text": msg.areaAskLocation,
  }
  sendMessage(sender, message)
  message = {
    "text": msg.expectLocation
  }
  sendMessage(sender, message)

  if (!evacuees.includes(sender)) {
    evacuees.push(sender)
  }

}

const incidentReport = (sender) => {

  let list1 = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": msg.askIncident,
        "buttons": [
          {
            "type": "postback",
            "title": "Earthquake (Lindol)",
            "payload": "earthquake"
          },
          {
            "type": "postback",
            "title": "Flooding (Pag-baha)",
            "payload": "flooding",
          },
          {
            "type": "postback",
            "title": "Landslide (Paguho ng Lupa)",
            "payload": "landslide",
          }
        ]
      }
    }
  }

  let list2 = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": msg.askProblem,
        "buttons": [
          {
            "type": "postback",
            "title": "Sunog (Fire)",
            "payload": "fire",
          },
          {
            "type": "postback",
            "title": "Others.. (Iba pa)",
            "payload": "accident",
          }
        ]
      }
    }
  }

  sendMessage(sender, list1);
  sendMessage(sender, list2);


  if (!reportees[sender]) {
    reportees[sender] = {
      id: sender,
      uid: guid(),
      type: '',
      specified: '',
      details: '',
      location: ''
    }
  }

  console.log(reportees);
}

const getDetails = (sender) => {
  sendMessage(sender, {
    "text": msg.getDetails
  })
}

const getSpecification = (sender) => {
  sendMessage(sender, {
    "text": msg.getSpecification
  })
}

const handleMessage = (sender_psid, received_message, attachments) => {
  let response;

  watchCommands(received_message.text, sender_psid);

  console.table(reportees);

  let report = reportees[sender_psid];

  if (report) {



    if (report.type === "accident" && report.specified === "") {
      report.specified = received_message.text;
      getDetails(sender_psid);
    }

    if (report.type === "accident"
      && report.specified !== ""
      && report.specified !== received_message.text
      && !attachments) {
      report.details = received_message.text;
      getLocation(sender_psid);
    }

    if (report.type !== "accident" && report.details === "" && !attachments) {
      report.details = received_message.text;
      getLocation(sender_psid);
    }

    if (report.type !== ""
      && report.details !== ""
      && report.location === "") {
      if (attachments && attachments[0].type === "location") {

        report.location = getCoordinates(attachments[0].payload.url)

        let messageText = msg.gotLocation

        sendMessage(sender_psid, { "text": messageText })
        io.emit("report", report);

        let newReport = report;
        newReport.status = "unverified";
        newReport.uid = report.uid;
        newReport.timestamp = Date.now();


        tempDB.get('incidents').value().push(newReport);
        tempDB.write();
      }
    }

    askforCompletetion(sender_psid)
  }

  if (evacuees.includes(sender_psid)) {
    if (attachments && attachments[0].type === "location") {

      let messageText = msg.waitforFacilities

      sendMessage(sender_psid, { "text": messageText })
      // broken due to messenger webhook version 6.0
      // getAreas(sender_psid, attachments[0].payload.coordinates)
      getAreas(sender_psid, getCoordinates(attachments[0].payload.url))
    } else {
      askForLocation(sender_psid)
    }
  }

  if (received_message.text && !evacuees.includes(sender_psid)) {

    console.log(`user has ping: ${received_message.text}`)

    if (!report) {
      // display default actions
      response = defaultActions();
      sendMessage(sender_psid, response);
    }

  }
}

// handle post back
const handlePostback = (sender_psid, received_postback) => {
  let response;

  // Get the payload for the postback
  let payload = received_postback.payload;

  if (payload === '') {
    response = textResponse(msg.goAhead);
    sendMessage(sender_psid, response);
  } else {

    switch (payload) {
      case 'report_incident':
        console.log('incident report!')
        incidentReport(sender_psid);
        break;
      case 'recent_events':
        console.log('recent events')
        sendRecentEvents(sender_psid);
        break;
      case 'evacuate':
        console.log('evacuation areas')
        getEvacuationAreas(sender_psid);
        break;
      case 'cancel_evacuation':
        if (evacuees) {
          evacuees.splice(evacuees.indexOf(sender_psid), 1)
          sendMessage(sender_psid, { "text": msg.cancelLocation })
          sendMessage(sender_psid, defaultActions())
        }
        break;
      case 'cancel_report':
        if (reportees[sender_psid]) {
          sendMessage(sender_psid, { "text": msg.cancelReport })
          sendMessage(sender_psid, defaultActions())

          io.emit("cancel_report", { report_id: reportees[sender_psid].uid })
          cancelReport(sender_psid)
        }
        break;
      default:
        let reportee = reportees[sender_psid]
        if (payload !== "accident") {
          if (reportee) {
            reportee.type = payload;
            getDetails(sender_psid)
          }
        } else {
          reportee.type = payload;
          getSpecification(sender_psid)
        }
    }
  }

}


io.sockets.on('connection', function (socket) {
  socket.on("verifyReport", (data) => {
    delete reportees[data.id];
    sendMessage(data.id, {
      "text": msg.reportVerified
    })

    sendMessage(data.id, {
      "text": msg.stayOnline
    })

    let reportInstance = tempDB.get('incidents').find({ uid: data.uid }).value()
    reportInstance.status = "verified"
    reportInstance.responder = data.responder

    tempDB.write();

    io.emit("verified_report", {
      uid: reportInstance.uid,
      responder: reportInstance.responder
    })
  })

  // the list of socket events below are for testing purposes only

  socket.on("test_report_data", (data) => {
    console.log("=================")
    console.log("Test Report")
    console.log("=================")
    let testReport = data
    testReport.uid = guid()
    console.log("Recieved test report data!")
    io.emit("report", data);
    tempDB.get('incidents').value().push(testReport);
    tempDB.write();
  })

  socket.on("test_cancel", (data) => {
    let id = data.id;

    let reportInstance = tempDB.get('incidents').find({ uid: id }).value()

    if (reportInstance) {
      reportInstance.status = "cancelled";
      tempDB.write()
      io.emit("cancel_report", { report_id: id })
    }
  })

});
