const express = require('express')
const cors = require('cors')
require('dotenv').config()
var jwt = require('jsonwebtoken');
const app = express()
const stripe = require('stripe') (process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000

// middleware
app.use(cors());
app.use(express.json());
// mongodb
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// db_name = Bistro-boss
// db_pass = f7ZhhiVeWTMqZBX9
const uri = `mongodb+srv://${process.env.db_name}:${process.env.db_pass}@cluster0.wqntyk8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const database = client.db("bistroDB");
        const menuCollection = database.collection("menu");
        const reviewCollection = database.collection("reviews");
        const cartCollection = database.collection("carts");
        const userCollection = database.collection("users");
        const paymentCollection = database.collection("payments");

        // menu collection related API
        app.get('/menu', async (req, res) => {
            const cursor = menuCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: id };
            const result = await menuCollection.findOne(query);
            // console.log('found item result is', result);
            res.send(result);
        })

        app.post('/menu', async (req, res) => {
            const item = req.body;
            console.log('new item', item);
            const result = await menuCollection.insertOne(item);
            res.send(result);
        })

        app.patch('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const item = req.body;
            const filter = { _id: id }
            const updateUser = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    image: item.image,
                    recipe: item.recipe
                }
            }
            const result = await menuCollection.updateOne(filter, updateUser);
            res.send(result);
        })

        app.delete('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })

        // review collection related API
        app.get('/review', async (req, res) => {
            const cursor = reviewCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        // cart collection related API
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const cursor = cartCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        // JWT related API start
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({ token })
        })
        // JWT related API End

        // middlewares For Verification Token JWT
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // users collection related API 
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const cursor = userCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        // start section for jwt
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })
        // End section for jwt

        app.post('/users', async (req, res) => {
            const user = req.body;
            // check the email, if email is unique then insert it into database 
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send('user is already exist');
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedUser = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedUser);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        // payment Intent with Stripe
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.get('/payments/:email', async (req, res) => {
            const query = { email: req.params.email };
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        // create payment histroy data in the database
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);

            // carefully delete each item from the cart
            console.log('payment Info', payment);
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };
            const deleteResult = await cartCollection.deleteMany(query);
            res.send({ paymentResult, deleteResult });
        })

        // stats or Analytics for Admin Dashboard
        app.get('/admin-stats', async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();
            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total,payment)=>total+payment.price,0);

            // mongodb aggregate for any collection
            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();
            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users, menuItems, orders, revenue
            })
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Bistro boss is commig...!!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
