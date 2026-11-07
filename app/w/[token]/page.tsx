"use client";
import {CarRegistrationScreen} from "@/app/components/CarRegistrationScreen";
export default function WorkerLinkPage({params}:{params:{token:string}}){
 return <CarRegistrationScreen token={params.token||""}/>;
}
