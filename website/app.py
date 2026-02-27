# Filename:  app-test.py
# Flask app for Flask + Firebase 
# Coded By:  Alex Oh

# Flask app to test sending user's Firebase information to Flask & writing sample data usign Pyrebase4

from flask import Flask, render_template, url_for, request, jsonify
from datetime import datetime
import pyrebase

app = Flask(__name__)       # Creates the app

config = {}
key = 0

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

# Route to test Pyrebase setup and transfer Arduino data to Firebase
@app.route('/test', methods=['GET', 'POST'])
def test():
    global config, userID, db, timeStamp, key, idToken

    # POST request (FB configuration sent from login.js, request.method defaults to GET)
    if request.method == 'POST':

        # Each data set will be stored under its own child node identified by a timestamp
        # Get time stamp to be used as firebase node
        timeStamp = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

        # Receive Firebase configuration credentials, pop uid and assign to userID
        config = request.get_json()
        userID = config.pop('userID')
        idToken = config.pop('idToken')
        
        # Output to a console (or file) is normally buffered (stored) until it is
        # forced out by the printing of a newline. Flush will force the information
        # in the buffer to be printed immediately.

        print('User ID: ' + userID, flush=True)     # Debug only
        print(config, flush=True)                   # Debug only
        print('ID Token: ' + idToken, flush=True)   # Debug only

        # Initialize firebase connection
        firebase = pyrebase.initialize_app(config)

        # Create a database object ("db" represents the root node in the database)
        db = firebase.database()

        # Write sample data to FB to test connection
        db.child('users/' + userID + '/data/' + timeStamp).update({'testKey': 'testValue'}, idToken)

        return 'Success', 200
    
    # If a GET request is made, check to see if the FB configuration has been provided. If not,
    # do nothing. If so, update the Firebase with the sensor data.
    else:
        if not config:
            print("FB config is empty")
        else:
            # Take parameters from Arduino request & assign value to variable "value"

            # print(config)
            value = request.args.get('distance')

            print('Distance: ' + value, flush=True)
            
            # Write Arduino data to Firebase
            db.child('users/' + userID + '/data/' + timeStamp).update({key:value}, idToken)

            # Increment key
            key += 1
        
        return 'Success', 200

# Main driving function
if __name__ == "__main__":

    # Run app through port 5000 on local dev
    app.run(debug=False, host='0.0.0.0', port=5000)