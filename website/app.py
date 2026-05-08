# Filename:  app-test.py
# Flask app for Flask + Firebase 
# Coded By:  Alex Oh

# Flask app to test sending user's Firebase information to Flask & writing sample data usign Pyrebase4
import pyrebase
from flask import Flask, render_template, url_for, request, jsonify, redirect
from datetime import datetime


app = Flask(__name__)       # Creates the app

config = {}
key = 0
currentUser = None
idToken = None

# Index page
@app.route("/")             # Index page route  
def index():                # Returns the index page
    return render_template("index.html")

# About page
@app.route("/about")        # About page route
def about():                # Returns the about page
    return render_template("about.html")

# Design page
@app.route("/design")       # Design page route
def design():               # Returns the design page
    return render_template("design.html")

# Dashboard page
@app.route("/dashboard")    # Dashboard page route
def dashboard():            # Returns the dashboard page
    return render_template("dashboard.html")

# Problem page
@app.route("/problem")      # Problem page route
def problem():              # Returns the problem page
    return render_template("problem.html")      

# Sign Up page
@app.route("/signUp")      # Sign Up page route
def signUp():              # Returns the sign up page
    return render_template("signUp.html") 

# Sign In page
@app.route("/signIn")      # Sign in page route
def signIn():              # Returns the sign in page
    return render_template("signIn.html") 

# Logout route
@app.route("/logout")
def logout():
    global currentUser, idToken, config, key
    currentUser = None
    idToken = None
    config = {}
    key = 0
    return redirect(url_for('signIn'))

@app.context_processor
def inject_globals():
    return dict(currentUser=currentUser)

# Route to Pyrebase setup and transfer Arduino data to Firebase
@app.route('/data', methods=['GET', 'POST'])
def data():
    global config, currentUser, db, timeStamp, key, idToken

    # POST request (FB configuration sent from login.js, request.method defaults to GET)
    if request.method == 'POST':

        # Each data set will be stored under its own child node identified by a timestamp
        # Get time stamp to be used as firebase node
        timeStamp = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

        # Receive Firebase configuration credentials, pop user ID and idToken
        config = request.get_json()
        currentUser = config.pop('currentUser', None)
        idToken = config.pop('idToken', None)

        if not currentUser or not idToken:
            return 'Missing authentication payload', 400
        
        # Output to a console (or file) is normally buffered (stored) until it is
        # forced out by the printing of a newline. Flush will force the information
        # in the buffer to be printed immediately.

        print('User ID: ' + currentUser['uid'], flush=True)     # Debug only
        print(config, flush=True)                   # Debug only
        print('ID Token: ' + idToken, flush=True)   # Debug only

        # Initialize firebase connection
        firebase = pyrebase.initialize_app(config)

        # Create a database object ("db" represents the root node in the database)
        db = firebase.database()

        # Write sample data to FB to test connection
        # db.child('users/' + currentUser['uid'] + '/data/' + timeStamp).update({'testKey': 'testValue'}, idToken)

        return 'Success', 200
    
    # If a GET request is made, check to see if the FB configuration has been provided. If not,
    # do nothing. If so, update the Firebase with the sensor data.
    else:
        if not config or not currentUser:
            print("FB config is empty or user is not signed in")
        else:
            # Take parameters from Arduino request & assign value to variable "value"

            # print(config)
            bend = request.args.get('bend')
            emg = request.args.get('emg')
            # imu = request.args.get('imu')

            print('Bend: ' + bend, flush=True)
            print('EMG: ' + emg, flush=True)
            # print('IMU: ' + imu, flush=True)

            # Write Arduino data to Firebase
            db.child('users/' + currentUser['uid'] + '/data/bend').update({key: bend}, idToken)
            db.child('users/' + currentUser['uid'] + '/data/emg').update({key: emg}, idToken)
            # db.child('users/' + currentUser['uid'] + '/data/imu').update({key: imu}, idToken)

            # Increment key
            key += 1
        
        return 'Success', 200

# Main driving function
if __name__ == "__main__":

    # Run app through port 5000 on local dev
    app.run(debug=True, port=5001)