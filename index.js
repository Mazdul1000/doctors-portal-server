const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;



// Middleware
app.use(express.json());
app.use(cors());

async function verifyToken(req, res, next) {
    const authorHeader = req.headers.authorization;
    if (!authorHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = authorHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nte3h.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {


    try {

        await client.connect();

        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');


        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send({ services });
        })

        // users api

        app.get('/users',verifyToken, async(req, res) => {
            const users =await userCollection.find().toArray();
            res.send(users)
        });


        // admin role
    
        app.get('/admin/:email', async(req,res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user.role === 'admin';
            res.send({admin:isAdmin});
        })


        app.put('/user/admin/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({email:requester});
            if(requesterAccount.role === 'admin'){
               const filter = { email: email };
            const updateDoc = {
                $set: {role: 'admin'},
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result); 
            }
            else{
                res.status(403).send({message: 'Forbidden access'})
            }
            
        })




        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '1d' })
            res.send({ result, token });
        })

        // This is the manual way to query.This is not the proper way
        // after learning more about mongodb , use aggregate, lookup, pipeline, match, group.

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            //step 1: get all services
            const services = await serviceCollection.find().toArray();

            //step 2: get the bookings of the day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: forEach every services, find booking for that service

            services.forEach(service => {
                const serviceBookings = bookings.filter(booking => booking.treatment === service.name);
                const bookedSlots = serviceBookings.map(s => s.slot);
                const availableSlots = service.slots.filter(s => !bookedSlots.includes(s));
                service.availableSlots = availableSlots;

            })
            return res.send(services);
        })
        /* **
  *API naming convention
  *app.get('/booking) //get all bookings in the collection
  *app.get('/booking/:id') //get a specific booking
  *app.post('/booking') //add a new booking
  *app.patch('/booking/:id') //
  *app.put('/booking/:id') // upsert == update or/and insert.
  *app.delete('booking/:id') //
 
 
 */

        // get bookings for specific person

        app.get('/booking', verifyToken, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;

            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }

        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })



    }

    finally {

    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Running the doctors portal server')
})

app.listen(port, () => {
    console.log(`listening to doctors portal server on port ${port}`)
})