import React,{useEffect,useState} from 'react';
import {Alert,Pressable,ScrollView,StatusBar,Text,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {signOut} from 'firebase/auth';
import {auth} from './src/config/firebase';
import {AuthProvider,useAuth} from './src/context/AuthContext';
import {isFirebaseConfigured} from './src/config/firebase';
import {brandGradient,colors as c} from './src/components/theme';
import {Card,Heading,Loading} from './src/components/UI';
import {IncidentBanner} from './src/components/IncidentBanner';
import {countLegacyVehicles,watchProfile,watchVehicles} from './src/lib/database';
import type {HelpRequest,Incident,Profile,Role,Vehicle} from './src/lib/types';
import {AuthScreen} from './src/screens/AuthScreen';
import {RoleSetupScreen} from './src/screens/RoleSetupScreen';
import {VehicleSetup} from './src/screens/VehicleSetup';
import {LegacyRestore} from './src/screens/LegacyRestore';
import {JoinScreen} from './src/screens/JoinScreen';
import {VehicleManager} from './src/screens/VehicleManager';
import {Dashboard} from './src/screens/Dashboard';
import {LocationScreen} from './src/screens/LocationScreen';
import {HelpScreen} from './src/screens/HelpScreen';
import {AlertsScreen} from './src/screens/AlertsScreen';
import {ContactsScreen} from './src/screens/ContactsScreen';
import {SettingsScreen} from './src/screens/SettingsScreen';
import {DrowsinessDetectionSettings} from './src/screens/DrowsinessDetectionSettings';
import {AccidentDetectionSettings} from './src/screens/AccidentDetectionSettings';

type Tab='home'|'map'|'help'|'alerts'|'contacts'|'vehicles'|'settings'|'drowsiness'|'mpu';
const nav:{key:Tab;label:string;icon:string;ownerOnly?:boolean}[]=[
 {key:'home',label:'Home',icon:'⌂'}, {key:'map',label:'Map',icon:'◎'},
 {key:'alerts',label:'Alerts',icon:'⚑',ownerOnly:true},
 {key:'contacts',label:'SMS',icon:'♧',ownerOnly:true}, {key:'vehicles',label:'Vehicles',icon:'▣',ownerOnly:true},
 {key:'settings',label:'Settings',icon:'⚙'},
];
function ConfigurationRequired(){return <SafeAreaView style={{flex:1,backgroundColor:c.background,justifyContent:'center',padding:20}}><Card>
 <Heading title="Connect Firebase" subtitle="Your .env file is missing required Firebase configuration."/>
 <Text style={{color:c.muted}}>Copy your existing .env file to this updated project and restart Expo with npx expo start -c. Do not use a service-account private key.</Text>
 </Card></SafeAreaView>;}
function MainApp(){
 const {user,loading}=useAuth();const [profile,setProfile]=useState<Profile|null>(null);
 const [profileLoading,setProfileLoading]=useState(true);const [vehicles,setVehicles]=useState<Vehicle[]>([]);
 const [vehiclesLoading,setVehiclesLoading]=useState(true);const [selectedId,setSelectedId]=useState<string|null>(null);
 const [legacyCount,setLegacyCount]=useState<number|null>(null);const [error,setError]=useState('');const [tab,setTab]=useState<Tab>('home');const [adding,setAdding]=useState(false);
 const [trackedRequest,setTrackedRequest]=useState<HelpRequest|Incident|null>(null);
 const [logoutBusy,setLogoutBusy]=useState(false);
 const clearUserState=()=>{
  setProfile(null);setProfileLoading(true);setVehicles([]);setVehiclesLoading(true);
  setSelectedId(null);setLegacyCount(null);setError('');setTab('home');setAdding(false);setTrackedRequest(null);
 };
 const confirmLogout=()=>{
  if(logoutBusy)return;
  Alert.alert('Log out?','Are you sure you want to log out?',[{text:'Cancel',style:'cancel'},
   {text:'Logout',style:'destructive',onPress:async()=>{
    if(!auth){Alert.alert('Unable to log out','Firebase Authentication is not available.');return;}
    setLogoutBusy(true);clearUserState();
    try{await signOut(auth);}
    catch(e:any){Alert.alert('Logout failed',e?.message||'Unable to log out. Please try again.');}
    finally{setLogoutBusy(false);}
   }}]);
 };
 useEffect(()=>{
 if(logoutBusy)return;
 if(!user){setProfile(null);setProfileLoading(false);return;}
 setProfileLoading(true);setError('');
 return watchProfile(user.uid,v=>{setProfile(v);setProfileLoading(false);},e=>{setError(e);setProfileLoading(false);});
 },[user?.uid,logoutBusy]);
 const role:Role|undefined=profile?.role;
 useEffect(()=>{let active=true;if(logoutBusy)return()=>{active=false;};if(!user||role!=='owner'){setLegacyCount(0);return()=>{active=false;};}setLegacyCount(null);countLegacyVehicles(user.uid).then(value=>{if(active)setLegacyCount(value);}).catch(()=>{if(active)setLegacyCount(0);});return()=>{active=false;};},[user?.uid,role,logoutBusy]);
 useEffect(()=>{
 if(logoutBusy)return;
 if(!user||!role){setVehicles([]);setSelectedId(null);setVehiclesLoading(false);return;}
 setVehiclesLoading(true);setError('');
 return watchVehicles(user.uid,role,items=>{
 setVehicles(items);setSelectedId(old=>old&&items.some(x=>x.id===old)?old:items[0]?.id||null);
 setVehiclesLoading(false);
 },e=>{setError(e);setVehiclesLoading(false);});
 },[user?.uid,role,logoutBusy]);
 if(logoutBusy)return <SafeAreaView style={{flex:1,backgroundColor:c.background}}><Loading/><Text style={{position:'absolute',top:'58%',alignSelf:'center',color:c.muted,fontWeight:'800'}}>Logging out…</Text></SafeAreaView>;
 if(loading||profileLoading)return <Loading/>;
 if(!user)return <AuthScreen/>;
 if(error)return <SafeAreaView style={{flex:1,backgroundColor:c.background,padding:20}}><Heading title="Firebase access error" subtitle={error}/>
 <Text style={{color:c.muted}}>Publish database.rules.json from this upgraded project. The previous owner-only rules are not compatible with passenger access.</Text></SafeAreaView>;
 if(!role)return <RoleSetupScreen uid={user.uid} email={user.email||''} initialName={profile?.name||user.displayName||''} onLogout={confirmLogout} logoutBusy={logoutBusy}/>;
 if(vehiclesLoading)return <Loading/>;
 if(role==='owner'&&!vehicles.length&&!adding&&legacyCount===null)return <Loading/>;
 if(role==='owner'&&!vehicles.length&&!adding&&(legacyCount||0)>0)return <LegacyRestore uid={user.uid} count={legacyCount!} onNew={()=>setAdding(true)} onImported={()=>setLegacyCount(0)} onLogout={confirmLogout} logoutBusy={logoutBusy}/>;
 if(role==='owner'&&(!vehicles.length||adding))return <VehicleSetup uid={user.uid} onCreated={id=>{setSelectedId(id);setAdding(false);setTab('home');}}
 onCancel={adding?()=>setAdding(false):undefined} allowRoleCorrection={!adding && legacyCount === 0} onLogout={confirmLogout} logoutBusy={logoutBusy}/>;
 if(role==='passenger'&&!vehicles.length)return <SafeAreaView style={{flex:1,backgroundColor:c.background}}><ScrollView contentContainerStyle={{padding:20,paddingBottom:34}} keyboardShouldPersistTaps="handled"><JoinScreen uid={user.uid} profile={profile!}/></ScrollView><Pressable disabled={logoutBusy} onPress={confirmLogout} style={{padding:15,alignItems:'center',opacity:logoutBusy?0.55:1}}><Text style={{color:c.blue,fontWeight:'800'}}>{logoutBusy?'Logging out…':'Logout'}</Text></Pressable></SafeAreaView>;
 const selected=vehicles.find(x=>x.id===selectedId)||vehicles[0];
 const visible=nav.filter(x=>role==='owner'||!x.ownerOnly);
 return <SafeAreaView style={{flex:1,backgroundColor:c.background}}><StatusBar backgroundColor={c.crimson} barStyle="light-content"/>
 <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={{paddingHorizontal:18,paddingTop:12,paddingBottom:15,borderBottomLeftRadius:24,borderBottomRightRadius:24}}>
 <Pressable testID="dashboard-logout" disabled={logoutBusy} onPress={confirmLogout} style={{alignSelf:'flex-end',borderWidth:1,borderColor:'#B7CBDD',borderRadius:9,paddingHorizontal:11,paddingVertical:6,marginBottom:5,opacity:logoutBusy?0.55:1}}><Text style={{color:c.white,fontSize:12,fontWeight:'900'}}>{logoutBusy?'Logging out…':'Logout'}</Text></Pressable>
 <Text style={{fontSize:11,fontWeight:'900',letterSpacing:1.5,color:'#B7CBDD'}}>SMART VEHICLE SAFETY · {role==='owner'?'OWNER':'PASSENGER'}</Text>
 <Text style={{fontSize:21,fontWeight:'900',color:c.white,marginTop:4}}>{selected.meta.plateNumber}</Text>
 <Text style={{color:'#B7CBDD',marginTop:3,fontSize:12}}>{selected.meta.route||'Route not set'}</Text>
 {vehicles.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:9}}>{vehicles.map(v=><Pressable key={v.id} onPress={()=>{setSelectedId(v.id);setTrackedRequest(null);}} style={{borderRadius:20,paddingVertical:7,paddingHorizontal:12,backgroundColor:v.id===selected.id?'rgba(255,255,255,0.24)':'rgba(45,18,56,0.5)',borderWidth:1,borderColor:'rgba(255,255,255,0.2)',marginRight:7}}>
 <Text style={{color:'white',fontWeight:'800',fontSize:12}}>{v.meta.plateNumber}</Text></Pressable>)}</ScrollView>:null}
 </LinearGradient>
 {role==='owner'?<IncidentBanner vehicleId={selected.id} openAlerts={()=>setTab('alerts')}/>:null}
 <ScrollView key={`${selected.id}-${tab}`} contentContainerStyle={{padding:16,paddingBottom:40}} keyboardShouldPersistTaps="handled">
 {tab==='home'?<Dashboard vehicle={selected} role={role} navigate={x=>{const next=x as Tab;if(next==='map')setTrackedRequest(null);setTab(next);}}/>:null}
 {tab==='map'?<LocationScreen vehicle={selected} trackedEvent={trackedRequest}/>:null}
 {tab==='help'?<HelpScreen uid={user.uid} profile={profile!} vehicle={selected} role={role}/>:null}
 {tab==='alerts'&&role==='owner'?<AlertsScreen vehicle={selected} onTrack={request=>{setTrackedRequest(request);setTab('map');}} onOpenSettings={()=>setTab('settings')} onManageVehicle={()=>setTab('vehicles')}/>:null}
 {tab==='contacts'&&role==='owner'?<ContactsScreen vehicle={selected}/>:null}
 {tab==='vehicles'&&role==='owner'?<VehicleManager uid={user.uid} vehicle={selected} onAddVehicle={()=>setAdding(true)}/>:null}
 {tab==='drowsiness'&&role==='owner'?<DrowsinessDetectionSettings uid={user.uid} vehicle={selected} onBack={()=>setTab('settings')}/>:null}
 {tab==='mpu'&&role==='owner'?<AccidentDetectionSettings uid={user.uid} vehicle={selected} onBack={()=>setTab('settings')}/>:null}
 {tab==='settings'?<SettingsScreen uid={user.uid} profile={profile!} role={role} vehicle={selected} onAddVehicle={()=>setAdding(true)} onManage={()=>setTab('vehicles')} onOpenDrowsiness={()=>setTab('drowsiness')} onOpenMpu={()=>setTab('mpu')} onLogout={confirmLogout} logoutBusy={logoutBusy}/>:null}
 </ScrollView>
 <View style={{borderTopWidth:1,borderColor:c.border,backgroundColor:c.white,borderTopLeftRadius:22,borderTopRightRadius:22,shadowColor:c.plum,shadowOpacity:0.1,shadowRadius:12,shadowOffset:{width:0,height:-4},elevation:8}}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:6,paddingTop:9,paddingBottom:10,flexGrow:1,justifyContent:'space-around'}}>
 {visible.map(item=><Pressable key={item.key} onPress={()=>{if(item.key==='map')setTrackedRequest(null);setTab(item.key);}} style={{minWidth:role==='owner'?60:77,paddingHorizontal:4,alignItems:'center'}}>
 <Text style={{fontSize:22,fontWeight:'900',color:item.key===tab||(tab==='drowsiness'&&item.key==='settings')?c.blue:c.muted}}>{item.icon}</Text>
 <Text style={{fontSize:10,fontWeight:'800',marginTop:3,color:item.key===tab||(tab==='drowsiness'&&item.key==='settings')?c.blue:c.muted}}>{item.label}</Text></Pressable>)}
 </ScrollView></View>
 </SafeAreaView>;
}
export default function App(){
 return <SafeAreaProvider>{isFirebaseConfigured?<AuthProvider><MainApp/></AuthProvider>:<ConfigurationRequired/>}</SafeAreaProvider>;
}
