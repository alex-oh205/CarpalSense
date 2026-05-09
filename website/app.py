# Filename:  app-test.py
# Flask app for Flask + Firebase 
# Coded By:  Alex Oh

# Flask app to test sending user's Firebase information to Flask & writing sample data usign Pyrebase4
import pyrebase
from flask import Flask, render_template, url_for, request, jsonify, redirect
from datetime import datetime
import time


app = Flask(__name__)       # Creates the app

config = {}
sessionTime = 0
prevSessionTime = 0
collectingData = False
currentUser = None
idToken = None
currentSessionId = None

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
    global currentUser, idToken, config, sessionTime, currentSessionId
    currentUser = None
    idToken = None
    config = {}
    sessionTime = 0
    currentSessionId = None
    return redirect(url_for('signIn'))

@app.context_processor
def inject_globals():
    return dict(currentUser=currentUser)

# Route to Pyrebase setup and transfer Arduino data to Firebase
@app.route('/data', methods=['GET', 'POST'])
def data():
    global config, currentUser, db, timeStamp, sessionTime, idToken

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
            if collectingData:
                # Take parameters from Arduino request & assign value to variable "value"
                bend = request.args.get('bend')
                emg = request.args.get('emg')
                # imu = request.args.get('imu')

                print('Bend: ' + str(bend), flush=True)
                print('EMG: ' + str(emg), flush=True)
                # print('IMU: ' + imu, flush=True)

                uid = currentUser['uid'] if isinstance(currentUser, dict) else currentUser
                sessionTime += time.perf_counter() - prevSessionTime
                prevSessionTime = time.perf_counter()

                # Write Arduino data to Firebase under the currently active session if one is registered
                if currentSessionId:
                    db.child('users/' + uid + '/sessions/' + currentSessionId + '/data/bend').update({sessionTime: bend}, idToken)
                    db.child('users/' + uid + '/sessions/' + currentSessionId + '/data/emg').update({sessionTime: emg}, idToken)
                    # db.child('users/' + uid + '/sessions/' + currentSessionId + '/data/imu').update({sessionTime: imu}, idToken)
        
        return 'Success', 200

@app.route('/session', methods=['POST'])
def session():
    global currentSessionId, collectingData, sessionTime, config, currentUser, db, idToken
    payload = request.get_json() or {}
    session_id = payload.get('sessionId')
    currentSessionId = session_id if session_id else None
    collectingData = False
    sessionTime = 0
    if config and currentUser and db and idToken and currentSessionId:
        lastData = db.child('users/' + currentUser['uid'] + '/sessions/' + currentSessionId +'/data/bend').order_by_key().limit_to_last(1).get(idToken)
        if lastData.each():
            for item in lastData.each():
                sessionTime = float(item.key())
        else:
            sessionTime = 0
    
    return 'Success', 200

@app.route('/session-data', methods=['POST'])
def session_data():
    global collectingData, sessionTime, prevSessionTime

    payload = request.get_json() or {}
    collecting = payload.get('collecting', False)
    reset = payload.get('reset', False)
    print(f"Collecting: {collecting}, Reset: {reset}", flush=True)
    if collecting:
        collectingData = True
        prevSessionTime = time.perf_counter()
    else:
        collectingData = False
    
    if reset:
        sessionTime = 0
    
    return 'Success', 200

# Main driving function
if __name__ == "__main__":

    # Run app through port 5000 on local dev
    app.run(debug=True, port=5001)