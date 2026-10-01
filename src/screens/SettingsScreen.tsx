import React,{useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {sendPasswordResetEmail} from 'firebase/auth';
import {auth} from '../config/firebase';
import {ActionButton,Card,Heading,Info} from '../components/UI';
import {colors as c} from '../components/theme';
import {leaveVehicle} from '../lib/database';
import type {Profile,Role,Vehicle} from '../lib/types';

export function SettingsScreen({uid,profile,role,vehicle,onAddVehicle,onManage,onOpenDrowsiness,onOpenMpu,onLogout,logoutBusy}:{uid:string;profile:Profile;role:Role;vehicle:Vehicle;onAddVehicle:()=>void;onManage:()=>void;onOpenDrowsiness:()=>void;onOpenMpu:()=>void;onLogout:()=>void;logoutBusy:boolean}){
 const [busy,setBusy]=useState(false);
 const reset=async()=>{if(!auth||!profile.email)return;try{await sendPasswordResetEmail(auth,profile.email);Alert.alert('Password reset','Check your email.');}catch(e:any){Alert.alert('Error',e?.message||'Try again.');}};
 return <View><Heading title="Settings" subtitle="Account, vehicle and access"/>
 <Card><Text style={{color:c.navy,fontSize:17,fontWeight:'900'}}>Your account</Text>
 <Text style={{color:c.muted,marginTop:8}}>{profile.name} · {profile.email}</Text>
 <Text style={{color:c.muted,marginTop:5}}>Role: {role==='owner'?'Vehicle owner / manager':'Passenger'}</Text>
 <ActionButton title="Email password reset link" variant="secondary" onPress={reset}/></Card>
 <Card><Text style={{color:c.navy,fontSize:17,fontWeight:'900'}}>{role==='owner'?'Vehicle management':'Current journey'}</Text>
 <Text style={{color:c.muted,marginTop:8}}>{vehicle.meta.plateNumber} · {vehicle.meta.route}</Text>
 {role==='owner'?<><Text selectable style={{color:c.text,marginTop:8}}>Driver: {vehicle.meta.driverPhone||'Not configured'}</Text>
 {!vehicle.meta.driverPhone?<Text style={{color:c.red,marginTop:5,fontSize:12}}>Driver phone number is not available. Please update the vehicle details.</Text>:null}
 <ActionButton title="Edit vehicle / invite passengers" onPress={onManage}/>
 <ActionButton title="Add another vehicle" variant="secondary" onPress={onAddVehicle}/>
 </>:<ActionButton title={busy?'Leaving…':'Leave this bus'} variant="secondary" disabled={busy} onPress={()=>Alert.alert('Leave bus?','You will lose access to this vehicle’s information.',[
 {text:'Cancel',style:'cancel'},{text:'Leave',style:'destructive',onPress:async()=>{setBusy(true);try{await leaveVehicle(uid,vehicle.id);}catch(e:any){Alert.alert('Error',e?.message||'Try again.');}finally{setBusy(false);}}}])}/>}</Card>
 {role==='owner'?<Card><Text style={{color:c.navy,fontSize:17,fontWeight:'900'}}>Sensor Settings</Text>
 <Text style={{color:c.muted,marginTop:8}}>Configure the vehicle’s detection sensors.</Text>
 <ActionButton title="Drowsiness Detection Settings" variant="secondary" onPress={onOpenDrowsiness}/>
 <ActionButton title="MPU6050 Settings" variant="secondary" onPress={onOpenMpu}/>
 </Card>:null}
 <ActionButton title={logoutBusy?'Logging out…':'Logout'} variant="danger" disabled={logoutBusy} onPress={onLogout}/>
 <Info text="In-app reports need internet. No hardware GPS, SMS, background push or emergency-service dispatch is implied before those systems are configured and verified."/>
 </View>;
}
