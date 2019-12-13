const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')
const request = require('request');
const axios = require('axios');

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

require('dotenv').config();


io.set('origins', '*:*');

let port = process.env.PORT || 7000;

app.use(express.static('views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors())
http.listen(port);

console.log(`===============================`)
console.log(`SagiPinas Code API ${port}`)
console.log(`===============================`)

const googleMapsAPIKEY = "AIzaSyD5kFZMwUIUDZ25nTtLx0_0G3x1d2GMiCY";

let evacuees = [];
let reportees = [];

import msg from './messages';


app.get("/", (req, res) => {
  res.send({
    message: "SagiPinas Core v. 1.0",
    status: "running"
  })
})

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

const callSendAPI = (sender_psid, response, cb = null) => {
  // Construct the message body
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

// send recent events

const sendRecentEvents = (sender) => {

  let sampleEvents = [
    {
      "title": "8 barangays in Pangasinan towns flooded",
      "image_url": "https://news.mb.com.ph/wp-content/uploads/2018/07/220718_AERIALFLOOD_PANGASINAN_01_BASA.jpg",
      "subtitle": "CALASIAO, Pangasinan -- Some eight barangays in Santa Barbara and this town remain flooded due to Tropical Depression (TD) 'Ineng' that was experienced all over Pangasinan."
    },
    {
      "title": "Magnitude 6.5 earthquake rocks parts of Mindanao",
      "image_url": "https://assets.rappler.com/7371A880F4664FD59067B002263C2370/img/A76D69B12FC14B78841DDEAB48C81C05/COLLAPSED_HOUSE_IN_BARANGAY_PARAISO_TULUNAN_COTABATO_A76D69B12FC14B78841DDEAB48C81C05.jpg",
      "subtitle": "The strong earthquake happens just two days after a magnitude 6.6 tremor struck Cotabato and affected other provinces in Mindanao"
    }
  ]

  let events = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": sampleEvents
      }
    }
  }

  callSendAPI(sender, events)
}

// ask for location again

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

  callSendAPI(sender, options)

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

  callSendAPI(sender, options)

}

// ask for completion

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

  callSendAPI(sender, options)

}

// get areas

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

        callSendAPI(sender, {
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
        callSendAPI(sender, AreaList);

      } else {
        callSendAPI(sender, {
          "text": msg.noAreas
        })
      }
      evacuees.splice(evacuees.indexOf(sender), 1)
    }).catch(err => {
      console.log(err)
    })
}

// evacuation areas

const getEvacuationAreas = (sender) => {
  let message = {
    "text": msg.areaAskLocation,
  }
  callSendAPI(sender, message)
  message = {
    "text": msg.expectLocation
  }
  callSendAPI(sender, message)

  if (!evacuees.includes(sender)) {
    evacuees.push(sender)
  }

}

// report an incident

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
            "payload": "others",
          }
        ]
      }
    }
  }

  callSendAPI(sender, list1);
  callSendAPI(sender, list2);


  if (!reportees[sender]) {
    reportees[sender] = {
      id: sender,
      type: '',
      specified: '',
      details: '',
      location: ''
    }
  }

  console.log(reportees);
}

const getDetails = (sender) => {
  callSendAPI(sender, {
    "text": msg.getDetails
  })
}

const getSpecification = (sender) => {
  callSendAPI(sender, {
    "text": msg.getSpecification
  })
}


// Handles messages events
const handleMessage = (sender_psid, received_message, attachments) => {
  let response;

  console.table(reportees);

  let reportee = reportees[sender_psid];

  if (reportee) {

    if (reportee.type === "others" && reportee.specified === "") {
      reportee.specified = received_message.text;
      getDetails(sender_psid);
    }

    if (reportee.type === "others"
      && reportee.specified !== ""
      && reportee.specified !== received_message.text) {
      reportee.details = received_message.text;
      getLocation(sender_psid);
    }
    // poor logic , faulty, must improve
    if (reportee.type !== "others" && reportee.details === "" && !attachments) {
      reportee.details = received_message.text;
      getLocation(sender_psid);
    }

    if (reportee.type !== ""
      && reportee.details !== ""
      && reportee.location === "") {
      if (attachments && attachments[0].type === "location") {
        reportee.location = attachments[0].payload.coordinates

        let messageText = msg.gotLocation

        callSendAPI(sender_psid, { "text": messageText })
        io.emit("report", reportee);

        let newReport = reportee;
        newReport.status = "unverified";
        newReport.uid = "123123123randomid";
        newReport.timestamp = Date.now();

        // save report type
        // db.get('incidents').value().push(newReport);
        // db.write();
      }
    }

    // askforCompletetion(sender_psid)
  }

  if (evacuees.includes(sender_psid)) {
    if (attachments && attachments[0].type === "location") {

      let messageText = msg.waitforFacilities

      callSendAPI(sender_psid, { "text": messageText })
      getAreas(sender_psid, attachments[0].payload.coordinates)
    } else {
      askForLocation(sender_psid)
    }
  }

  if (received_message.text && !evacuees.includes(sender_psid)) {

    console.log(`user has ping: ${received_message.text}`)

    if (!reportee) {
      // display defualt actions
      response = defaultActions();
      callSendAPI(sender_psid, response);
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
    callSendAPI(sender_psid, response);
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
        evacuees.splice(evacuees.indexOf(sender_psid), 1)
        callSendAPI(sender_psid, { "text": msg.cancelLocation })
        callSendAPI(sender_psid, defaultActions())
        break;
      case 'cancel_report':
        reportees.splice(reportees.indexOf(sender_psid), 1)
        callSendAPI(sender_psid, { "text": msg.cancelReport })
        callSendAPI(sender_psid, defaultActions())
        break;
      default:
        let reportee = reportees[sender_psid]
        if (payload !== "others") {
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

// API routes


io.sockets.on('connection', function (socket) {
  socket.on("verifyReport", (data) => {
    delete reportees[data.id];
    callSendAPI(data.id, {
      "text": msg.reportVerified
    })

    callSendAPI(data.id, {
      "text": msg.stayOnline
    })

    // db.get('incidents').find({ uid: data.uid }).value().status = "verified";
    // db.write();

    // change report status to verified
  })
});
